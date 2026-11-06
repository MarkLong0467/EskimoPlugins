import { DEFAULTS } from './defaults'
import { diag } from './diag'
import { flushThemeCaches, restoreSaturation } from './lib/flush'
import { readWallpaper } from './lib/native'
import { installPicker, pickerStatus, uninstallPicker } from './lib/picker'
import {
	diagnostics,
	installRegister,
	rebuild,
	uninstallRegister,
} from './lib/register'
import { installResolver, uninstallResolver } from './lib/resolver'
import {
	getSettings,
	notifySettings,
	setSettings,
	setStorage,
	subscribeSettings,
} from './lib/settings'
import { getTheme } from './lib/tokens'
import { installTopBar, topbarStatus, uninstallTopBar } from './lib/topbar'
import Settings from './ui/Settings'
import type { MaterialCordSettings } from './types'

export { DEFAULTS }
export type { MaterialCordSettings }

export default plugin<{ jsonStorage: MaterialCordSettings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorage(jsonStorage)

		// Move the theme key before anything renders through the repainted
		// maps, so the palette under the pre-plugin key stays Discord's.
		if (getSettings().enabled) flushThemeCaches()

		// Resolver first: while a persisted Material key resolves before the
		// maps are in place, the wrapper falls back to the reference theme.
		if (installResolver()) {
			cleanup(uninstallResolver)
			diag.log('patch', 'semantic resolver installed')
		} else {
			console.warn('[materialcord] semantic resolver unavailable')
			diag.log('patch', 'semantic resolver unavailable', 'warn')
		}

		if (installRegister()) {
			cleanup(uninstallRegister)
			// The rows only work with the maps in place — picking one without
			// them would save a key nothing can resolve.
			if (installPicker()) {
				cleanup(uninstallPicker)
				diag.log('patch', 'theme picker rows installed')
			} else {
				console.warn('[materialcord] theme picker rows unavailable')
				diag.log('patch', 'theme picker rows unavailable', 'warn')
			}
		} else {
			console.warn('[materialcord] colour registration unavailable')
			diag.log('patch', 'colour registration unavailable', 'warn')
		}

		if (installTopBar()) {
			cleanup(uninstallTopBar)
			diag.log('patch', 'app theme header button installed')
		} else {
			console.warn('[materialcord] app theme header button unavailable')
			diag.log('patch', 'app theme header button unavailable', 'warn')
		}

		// A seed change repaints the explicit maps and flushes style caches.
		cleanup(subscribeSettings(() => rebuild()))
		cleanup(
			jsonStorage.subscribe(() => {
				notifySettings()
			}),
		)

		// Wallpaper decoding is async and can change the seed, which flushes on write.
		readWallpaper().then(info => {
			diag.log(
				'wallpaper',
				`source ${info.source}${info.note ? `: ${info.note}` : ''}`,
			)
			if (info.source === 'wallpaper' && info.primary != null) {
				setSettings({ seed: info.primary })
			}
		})

		const status = diagnostics()
		diag.log('plugin', `started, theme ${getTheme()}`)
		console.log(
			`[materialcord] started · theme=${getTheme()} · picker=${pickerStatus()} · definitions=${status.definitions} · entries=${status.entries} · raws=${status.raws} · shadows=${status.shadows} · dividers=${status.dividers} · sync=${status.sync} · native=${status.native} · modes=${status.modes} · converter=${status.converter} · topbar=${topbarStatus()} · test=${status.test}`,
		)
	},
	stop() {
		uninstallTopBar()
		uninstallPicker()
		// The register writes the reference theme back while the resolver and
		// the save wrapper are still in place.
		uninstallRegister()
		uninstallResolver()
		restoreSaturation()
	},
	SettingsComponent: Settings,
})
