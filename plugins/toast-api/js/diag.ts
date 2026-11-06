import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { getSettings } from './lib/settings'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". */
export const diag = createDiagnostics('Toast API', {
	settings: getSettings,
	consolePrefixes: ['[toast-api'],
})
