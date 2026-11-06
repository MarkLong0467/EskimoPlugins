import { diag } from './diag'
import { initKmmiioLib } from './lib/modules'
import { patchChatInput } from './lib/patch'
import Settings from './Settings'

export default plugin({
	start({ cleanup, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		const kmmiio = plugin.api?.unscoped?.kmmiio
		kmmiio?.setActivePlugin?.(plugin.manifest.id)
		initKmmiioLib(plugin.api)
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
		cleanup(diag.apply('chat input toolbar', patchChatInput))

		if (plugin.startedLate) {
			plugin.requireReload()
		}
	},
	SettingsComponent: Settings,
})
