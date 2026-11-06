import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { getPendingCount, getSeenCount, isSeeded } from './lib/sessionState'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". Device hashes are never put in it. */
export const diag = createDiagnostics('Better Devices', {
	extra: () => [
		`devices seen: ${getSeenCount()}`,
		`new devices waiting to be looked at: ${getPendingCount()}`,
		`first list recorded as the baseline: ${isSeeded()}`,
	],
	consolePrefixes: ['[Sessions', '[kmmiio'],
})
