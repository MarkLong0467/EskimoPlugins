import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { state } from './state'

/** What happened since the plugin started. */
export const stats = {
	sent: 0,
	failed: 0,
	edited: 0,
	/** The message menu: whether the row was added. */
	menu: 'not opened yet',
	lastScheduleError: '',
}

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * A webhook's address is a key anyone can send with, and messages are private, so the report holds only counts.
 */
export const diag = createDiagnostics('Webhook Builder', {
	credit: [
		'Made by MarkLong0467 (https://github.com/MarkLong0467)',
		'After Discohook (https://discohook.app)',
	],
	settings: () => {
		const s = state()
		return {
			...s.options,
			webhooks: s.webhooks.length,
			saved: s.saved.length,
			sent: s.sent.length,
			scheduled: s.scheduled.length,
			draftEmbeds: s.draft.embeds.length,
		}
	},
	extra: () => [
		`sent ${stats.sent}, failed ${stats.failed}, edited ${stats.edited}`,
		`message menu: ${stats.menu}`,
		stats.lastScheduleError
			? `last scheduled problem: ${stats.lastScheduleError}`
			: 'no scheduled problems',
	],
})
