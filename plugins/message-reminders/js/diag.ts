import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { setting } from './config'
import { all, due } from './reminders'
import { whenOf } from './time'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * What messages say and who wrote them is private, so the report holds only counts and times.
 */
export const diag = createDiagnostics('Message Reminders', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => {
		const list = all()
		const next = list.find(r => r.at > Date.now())
		return {
			menu: setting('menu'),
			sheet: setting('sheet'),
			snoozeMinutes: setting('snoozeMinutes'),
			reminders: list.length,
			dueNow: due().length,
			next: next ? whenOf(next.at) : 'none',
			snoozedOften: list.filter(r => r.snoozes >= 3).length,
		}
	},
	consolePrefixes: ['[message-reminders'],
})
