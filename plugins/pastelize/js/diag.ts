import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { store } from './config'
import { counts } from './state'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". */
export const diag = createDiagnostics('Pastelize', {
	credit: [
		'Made by MarkLong0467 (https://github.com/MarkLong0467)',
		'After Pastelize for Vendetta by Cynosphere (https://github.com/Cynosphere)',
	],
	settings: () => ({
		everyone: store.get('everyone'),
		webhookName: store.get('webhookName'),
		mentions: store.get('mentions'),
	}),
	extra: () =>
		Object.entries(counts).map(
			([name, count]) => `${name}: ${count.changed} of ${count.seen} coloured`,
		),
})
