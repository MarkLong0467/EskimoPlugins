import { DEFAULTS } from './defaults'
import { diag } from './diag'
import { pushNativeConfig } from './lib/bridge'
import { initKmmiioLib, kmmiioLib } from './lib/modules'
import { patchAll } from './lib/patches'
import { getSettings, setStorage } from './lib/state'
import Settings from './settings'
import type { DeclutterSettings } from './types'

export { DEFAULTS }
export type { DeclutterSettings }

export default plugin<{ jsonStorage: DeclutterSettings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		initKmmiioLib(plugin.api)
		const kmmiio = kmmiioLib()
		kmmiio?.setActivePlugin?.(plugin.manifest.id)
		kmmiio?.registerPlugin({
			id: plugin.manifest.id,
			name: plugin.manifest.name,
			icon: plugin.manifest.icon,
			author: plugin.manifest.author,
			description: plugin.manifest.description,
			version: plugin.manifest.version,
			getStatus: () => (plugin.errors.length > 0 ? 'Errored' : 'Running'),
			getErrors: () => plugin.errors,
		})
		setStorage(jsonStorage)

		cleanup(diag.apply('declutter patches', patchAll))

		const sync = () => {
			void pushNativeConfig()
		}
		// Defer native call until after initial render to avoid blocking splash
		setTimeout(sync, 0)
		cleanup(jsonStorage.subscribe(sync))

		// Avatar decorations are parsed once and cached on records, so an enabled state only
		// fully applies after a reload. When the plugin is enabled while the app is running,
		// cached records still hold the pre-enable decorations
		if (plugin.startedLate && getSettings().avatarDecorations) {
			plugin.requireReload()
		}
	},
	// The same caching that delays the enabled state also delays the disabled state: hidden
	// clutter (avatar decorations, nameplates, ...) stays parsed on already-cached records,
	// so disabling or uninstalling the plugin only fully applies after a reload.
	stop() {
		this.requireReload()
	},
	SettingsComponent: Settings,
})
