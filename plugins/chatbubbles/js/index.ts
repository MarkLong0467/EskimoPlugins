import { DEFAULTS } from './defaults'
import { diag } from './diag'
import { initKmmiioLib } from './lib/kmmiio'
import { startBubbles } from './lib/manager'
import { setStorage } from './lib/state'
import Settings from './settings'
import type { ChatBubblesStorage } from './types'

export { DEFAULTS }
export type { ChatBubblesStorage }

export default plugin<{ jsonStorage: ChatBubblesStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		const kmmiio = plugin.api?.unscoped?.kmmiio
		initKmmiioLib(plugin.api)
		kmmiio?.setActivePlugin?.(plugin.manifest.id)
		setStorage(jsonStorage)
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
		startBubbles(cleanup)
	},
	SettingsComponent: Settings,
})
