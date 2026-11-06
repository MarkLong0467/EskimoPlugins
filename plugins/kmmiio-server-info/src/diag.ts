import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". */
export const diag = createDiagnostics('Server Info (kmmiio99o)', {
	consolePrefixes: ['[kmmiio'],
})
