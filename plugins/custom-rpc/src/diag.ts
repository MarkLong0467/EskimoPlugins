import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { getSettings, pluginState } from './lib/state'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The settings hold your activity text, so the report keeps only what is needed to see why an activity does not show.
 */
export const diag = createDiagnostics('Custom RPC', {
	settings: () => {
		const s = getSettings()
		return {
			enabled: s.enabled,
			activityType: s.activityType,
			applicationName: s.applicationName ? '(set)' : '(empty)',
			clientId: s.clientId ? '(set)' : '(empty)',
			details: s.details ? '(set)' : '(empty)',
			state: s.state ? '(set)' : '(empty)',
			largeImage: s.largeImage?.source,
			smallImage: s.smallImage?.source,
			buttons: s.buttons?.map(b => (b.enabled ? 'on' : 'off')),
		}
	},
	extra: () => [`plugin stopped: ${pluginState.pluginStopped}`],
	consolePrefixes: ['[custom-rpc', '[Custom-RPC', '[CustomRPC'],
})
