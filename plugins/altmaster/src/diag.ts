import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { getStorage } from './lib/state'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". */
export const diag = createDiagnostics('AltMaster', {
	settings: () => getStorage()?.cache,
	consolePrefixes: ['[altmaster', '[AltMaster'],
})
