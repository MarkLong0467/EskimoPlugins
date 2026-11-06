import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { daysSetting, setting } from './config'
import { applied, modeAt } from './engine'
import { daysText, minuteText, whenOf } from './schedule'
import { found, readNow, settingsModules } from './status'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * Custom status text is private, so the report holds only whether one is set.
 */
export const diag = createDiagnostics('Quiet Hours', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => ({
		enabled: setting('enabled'),
		days: daysText(daysSetting()),
		from: minuteText(Number(setting('from'))),
		to: minuteText(Number(setting('to'))),
		status: setting('status'),
		showCustom: setting('showCustom'),
		hasCustomText: !!String(setting('customText') || '').trim(),
		buzz: setting('buzz'),
	}),
	extra: () => {
		const held = applied()
		const mode = modeAt()
		const lines = [`Mode: ${mode.kind}`]
		if (mode.kind === 'next' || mode.kind === 'skipped')
			lines.push(
				`Next window: ${whenOf(mode.window.start)} to ${whenOf(mode.window.end)}`,
			)
		if (held) {
			lines.push(
				`Applied: ${held.status} since ${whenOf(held.at)}, ends ${whenOf(held.end)}`,
				`Before that: ${held.before.status}${held.before.custom ? ' with a custom status' : ''}`,
			)
		}
		try {
			lines.push(`Status now: ${readNow().status}`)
		} catch {
			lines.push('Status now: unreadable')
		}
		return lines
	},
	checks: () => [
		{
			ok: !!settingsModules() || found(),
			label: 'Discord status settings found',
		},
		{
			ok: Number(setting('from')) !== Number(setting('to')),
			label: 'Start and end times differ',
		},
		{
			ok: daysSetting().some(Boolean),
			label: 'At least one day is on',
		},
	],
	consolePrefixes: ['[quiet-hours'],
})
