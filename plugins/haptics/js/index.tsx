/**
 * Haptics, by MarkLong0467.
 *
 * Switches for the buzzing Discord does: when a long-press menu opens, other haptic feedback, and plain vibrations.
 *
 * How it works: the menu buzz is Discord's own `disableHapticOnOpen` option, set when you turn it off. The other
 * buzzes are found by name in Discord's code and swallowed. Every buzz the plugin sees is listed in the settings, so a
 * buzz that is not caught can be tracked down.
 *
 * How it is put together:
 * - `hooks.ts` has the three kinds of hook (menus, haptic libraries, vibrations),
 * - `state.ts` is the log and the list of buzzes, `config.ts` reads the switches,
 * - `Settings.tsx` is the settings screen, `util.ts` holds small helpers.
 */

import { setStorage } from './config'
import { DEFAULT_SETTINGS, MENU_RETRY_MS } from './constants'
import { hookLibraries, hookMenus, hookVibration } from './hooks'
import Settings from './Settings'
import { clearListeners, hooks, note } from './state'
import { attempt } from './util'
import type { HapticsSettings } from './types'

export default plugin<{ jsonStorage: HapticsSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		const menus = () => {
			attempt('hooking menus', () => {
				if (!hookMenus(cleanup))
					note('Menus: the menu opener was not found yet')
			})
		}
		menus()
		// Discord's menu opener can load a moment after start: look once more.
		const retry =
			hooks.menus === 'working' ? null : setTimeout(menus, MENU_RETRY_MS)

		attempt('hooking libraries', () => hookLibraries(cleanup))
		attempt('hooking vibrations', () => {
			if (!hookVibration(cleanup)) note('Vibrations: not found')
		})

		cleanup(() => {
			if (retry) clearTimeout(retry)
			clearListeners()
		})
	},
})
