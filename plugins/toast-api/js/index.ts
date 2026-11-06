import { toasts } from './api/api'
import { clearAll } from './api/engine'
import { notifyEntries } from './api/store'
import { DEFAULTS } from './defaults'
import { diag } from './diag'
import { setOnIconResolved, warmIcons } from './lib/icons'
import { installToastOverride } from './lib/override'
import { patchAll } from './lib/patches'
import { notifySettings, setStorage } from './lib/settings'
import Settings from './ui/Settings'
import type { ToastApi } from './api/api'
import type { ToastApiSettings, ToastEntry, ToastInput } from './types'

export { DEFAULTS }
export type { ToastApi, ToastApiSettings, ToastEntry, ToastInput }

export default plugin<{ jsonStorage: ToastApiSettings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, unscoped, decorate, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorage(jsonStorage)
		// Icon modules are shared with Discord's own toasts, so this normally
		// resolves synchronously; the callback covers the cold case.
		setOnIconResolved(notifyEntries)
		warmIcons()

		cleanup(
			jsonStorage.subscribe(() => {
				notifySettings()
			}),
		)

		// Dependents can reach the API either way: globally, or scoped to themselves.
		unscoped.toasts = toasts
		decorate(plugin => {
			plugin.api.toasts = toasts
			return () => {
				Reflect.deleteProperty(plugin.api, 'toasts')
			}
		})

		cleanup(diag.apply('toast layer', patchAll))

		cleanup(diag.apply('Discord toast override', installToastOverride))
	},
	stop({ unscoped }) {
		clearAll()
		setOnIconResolved(() => {})
		Reflect.deleteProperty(unscoped, 'toasts')
	},
	SettingsComponent: Settings,
})

declare module '@valenced/plugins/types' {
	interface PluginApi {
		toasts: ToastApi
	}
	interface UnscopedPluginApi {
		toasts: ToastApi
	}
}
