import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { getSettings } from './lib/state'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * Usernames, API keys and tokens never reach the report, and neither does the title of what is playing. The lines about
 * the services, the errors and the last update are added in `index.ts`, which can read the plugin's debug counters.
 */
export const diag = createDiagnostics('Multi Scrobbler', {
	settings: getSettings,
	consolePrefixes: ['[MultiScrobbler', '[Multi-Scrobbler', '[multi-scrobbler'],
})
