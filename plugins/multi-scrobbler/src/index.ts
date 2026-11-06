import { KmmiioLib } from '../../../shared/kmmiio/lib/api'
import { DEFAULTS } from './defaults'
import { diag } from './diag'
import { debugInfo } from './lib/debug'
import { stop, tryInitialize } from './lib/manager'
import { initKmmiioLib } from './lib/modules'
import { getSettings, setStorage } from './lib/state'
import { setToastApi } from './lib/toasts'
import { applySidebarSettings, registerPages } from './ui/pages/routes'
import Settings from './ui/pages/Settings'
import type { MultiScrobblerStorage } from './types'

export { DEFAULTS }
export type { MultiScrobblerStorage }

export default plugin<{ jsonStorage: MultiScrobblerStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		diag.configure({
			extra: () => [
				`service: ${debugInfo.currentService ?? 'none yet'}`,
				`last successful update: ${debugInfo.lastSuccessfulUpdate ?? 'never'}`,
				`api calls: ${debugInfo.apiCallCount ?? 0}; connection attempts: ${debugInfo.connectionAttempts ?? 0}`,
				`a track has been seen: ${debugInfo.lastTrack ? 'yes' : 'no'}`,
				`last error: ${debugInfo.lastError?.message ?? 'none'}`,
				`component errors: ${debugInfo.componentMountErrors?.length ?? 0}`,
				`navigation error: ${debugInfo.lastNavigationError ?? 'none'}`,
				...Object.entries(debugInfo.serviceErrors ?? {}).map(
					([service, errors]) => `${service} errors: ${errors.length}`,
				),
			],
		})
		const kmmiio = KmmiioLib
		kmmiio?.setActivePlugin?.(plugin.manifest.id)
		initKmmiioLib(plugin.api)
		setToastApi(plugin.api)
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

		// Initialize settings from shared storage
		getSettings()

		// Register settings pages (routes)
		cleanup(diag.apply('settings pages', registerPages))
		cleanup(diag.apply('settings sidebar', applySidebarSettings))

		try {
			cleanup(() => stop())
			void tryInitialize()
		} catch {}
	},
	SettingsComponent: Settings,
})
