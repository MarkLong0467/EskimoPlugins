import { DEFAULTS } from './defaults'
import { diag } from './diag'
import { initKmmiioLib } from './lib/modules'
import { patchOverflow } from './lib/overflow'
import { setStorage } from './lib/state'
import Settings from './settings'
import type { AltMasterStorage } from './types'

export default plugin<{ jsonStorage: AltMasterStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		const kmmiio = plugin.api?.unscoped?.kmmiio
		kmmiio?.setActivePlugin?.(plugin.manifest.id)
		initKmmiioLib(plugin.api)
		kmmiio?.registerPlugin?.({
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

		cleanup(diag.apply('profile menu rows', patchOverflow))
	},
	SettingsComponent: Settings,
})
