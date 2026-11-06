/**
 * Force Timestamp Locale.
 *
 * Shows every timestamp in one language, whatever language Discord is in. The default is `en-gb`, which gives 24-hour times
 * and day/month/year dates.
 *
 * Ported 1:1 to Valenced from the Revenge plugin by PalmDevs (https://github.com/PalmDevs/revenge-plugins).
 *
 * How it works. Discord draws its dates with the moment library, which has one locale for the whole app. This plugin replaces
 * moment's `locale` and `lang` so that Discord's own attempts to change the locale are ignored, loads every locale Discord
 * ships (`momentLocales`) and sets the chosen one with a symbol that lets its own calls through.
 */

import { getModules } from '@valenced/modules/finders'
import { propsFilter } from '../../../shared/palmdevs/finders'
import { DEFAULT_SETTINGS, store } from './config'
import { diag } from './diag'
import { findLocaleLoaders, findMoment, PASSTHROUGH } from './moment'
import Settings from './Settings'
import { resetState, state } from './state'
import type { LocaleSettings } from './config'
import type { Moment } from './moment'

/** Sets the locale with the symbol that gets through the patch. */
export function applyLocale(moment: Moment, locale: string): void {
	moment.locale(locale, PASSTHROUGH)
	state.applied = locale
}

export default plugin<{ jsonStorage: LocaleSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		let stopped = false
		cleanup(() => {
			stopped = true
			store.clear()
		})

		/** Locks the locale and loads every locale, once the moment library is there. */
		const lock = async (moment: Moment) => {
			state.original = moment.locale()

			// Reading the locale is passed on, setting it is ignored unless it carries the symbol.
			const patched = (
				args: unknown[],
				original: (...passed: unknown[]) => unknown,
			) => {
				if (args.length === 0) return original()
				if (args[1] === PASSTHROUGH) return original(args[0])
				state.blocked++
				return args[0]
			}
			const unpatchLocale = diag.apply('moment.locale', () =>
				valenced.patcher.instead(moment, 'locale', patched as never),
			)
			const unpatchLang = diag.apply('moment.lang', () =>
				valenced.patcher.instead(moment, 'lang', patched as never),
			)
			state.patched = true
			cleanup(() => {
				unpatchLocale()
				unpatchLang()
				state.patched = false
				try {
					moment.locale(state.original)
				} catch (error) {
					diag.fail('restore', error)
				}
				resetState()
			})

			const loaders = findLocaleLoaders()
			if (!loaders)
				diag.log('locales', 'The list of locales was not found', 'warn')
			for (const name in loaders ?? {}) {
				if (stopped) return
				try {
					await (loaders as Record<string, () => Promise<unknown>>)[name]?.()
					state.loaded++
				} catch (error) {
					state.failed++
					diag.fail(`locale ${name}`, error)
				}
			}
			if (stopped) return
			state.ready = true
			applyLocale(moment, store.get('locale'))
			diag.log(
				'locale',
				`${store.get('locale')} applied, ${state.loaded} loaded`,
			)
		}

		const moment = diag.guard('find moment', () => findMoment())
		if (moment) {
			lock(moment).catch(error => diag.fail('lock', error))
			return
		}
		// The library is not there yet: wait for it.
		diag.log('moment', 'not loaded yet, waiting', 'warn')
		let started = false
		cleanup(
			getModules(propsFilter('isMoment'), () => {
				const late = findMoment()
				if (!late || started) return
				started = true
				lock(late).catch(error => diag.fail('lock', error))
			}),
		)
	},
})
