import { DEFAULTS } from './defaults'
import { diag } from './diag'
import { patchActionSheet } from './lib/actionSheet'
import { patchEditing } from './lib/editing'
import { patchLogging } from './lib/logging'
import {
	patchDeletedBackground,
	patchEphemeralAppearance,
	patchMessageRenderer,
} from './lib/messageRenderer'
import { initKmmiioLib } from './lib/modules'
import { setStorage } from './lib/state'
import Settings from './settings'
import type { MessageTweaksStorage } from './types'

export default plugin<{ jsonStorage: MessageTweaksStorage }>({
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

		cleanup(diag.apply('edit tracking', patchEditing))
		cleanup(diag.apply('message renderer', patchMessageRenderer))
		cleanup(diag.apply('ephemeral messages', patchEphemeralAppearance))
		cleanup(diag.apply('deleted message tint', patchDeletedBackground))
		cleanup(diag.apply('message action sheet', patchActionSheet))
		cleanup(diag.apply('deleted/edited logging', patchLogging))
	},
	SettingsComponent: Settings,
})
