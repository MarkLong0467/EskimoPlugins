import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { snapshot } from './lib/modules'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". */
export const diag = createDiagnostics('Server Drawer', {
	settings: snapshot,
	consolePrefixes: ['[ServerDrawer', '[server-drawer'],
})
