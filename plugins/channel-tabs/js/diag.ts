import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { store } from './config'
import { counts, facts } from './state'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". */
export const diag = createDiagnostics('Channel Tabs', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => ({
		position: store.get('position'),
		layout: store.get('layout'),
		tabs: store.get('tabs').length,
		split: store.get('split')?.id ?? 'off',
		collapsed: store.get('collapsed'),
		splitChat: store.get('splitChat'),
	}),
	extra: () => [
		...Object.entries(counts).map(
			([name, count]) => `${name}: ${count.changed} of ${count.seen} drawn`,
		),
		...Object.entries(facts).map(([name, value]) => `${name}: ${value}`),
	],
})
