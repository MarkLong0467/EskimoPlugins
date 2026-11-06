import { diag } from './diag'
import { patchGuildsBarContextMenu } from './lib/contextMenu'
import { initKmmiioLib } from './lib/modules'
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
		diag.check(
			'Server icon menu found',
			false,
			'Not seen yet. If this stays, reload Discord.',
		)
		cleanup(diag.apply('server icon menu', patchGuildsBarContextMenu))

		// The guilds bar menu module is looked up at plugin start; when the plugin is
		// enabled while the app is already running that module may have already
		// initialized, so the context menu patch can be missed. Requiring a reload
		// guarantees the patch always applies from a clean start.
		if (plugin.startedLate) {
			plugin.requireReload()
		}
	},
	SettingsComponent: Settings,
})
