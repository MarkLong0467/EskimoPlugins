import { Stores } from '@valenced/discord/flux'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { readUndo } from './apply'
import { setting } from './config'
import { VERSION } from './constants'
import { readPresets, statusInfo, timeLabel } from './presets'
import { found, log, toast } from './state'
import { customLine, readNow, settingsModules, write } from './status'
import type { Check } from './types'

/** Your status right now in words: "Do Not Disturb until 8:00 PM · “Sleeping” until 8:00 PM". */
export function nowLine(): string {
	const now = readNow()
	const ends = now.expires !== '0' ? ` until ${timeLabel(now.expires)}` : ''
	const custom = now.custom
		? ` · “${customLine(now.custom)}”${now.custom.expiresAtMs !== '0' ? ` until ${timeLabel(now.custom.expiresAtMs)}` : ''}`
		: ' · no custom status'
	return `${statusInfo(now.status).l}${ends}${custom}`
}

/** A plain text report of the presets, what was found, your status and the last actions, for pasting into a chat. */
export function buildReport(): string {
	const presets = readPresets()
	const undo = readUndo()
	return [
		'Status Presets report',
		`version: ${VERSION}`,
		`presets: ${presets.length} (${presets.map(p => p.name).join(', ') || '-'})`,
		`status settings: ${found.settings}`,
		`account sheet seen: ${found.sheet} time(s); presets there: ${setting('inSheet') ? 'on' : 'off'}`,
		`"Set your status" screen seen: ${found.editor} time(s); presets there: ${setting('inEditor') ? 'on' : 'off'}`,
		`my status now: ${nowLine()}`,
		`undo saved: ${undo ? undo.name : 'no'}`,
		'last actions:',
		...(log.length
			? log.map(
					l =>
						`  ${l.ok ? 'ok' : 'FAIL'} ${new Date(l.at).toLocaleTimeString()} ${l.text}`,
				)
			: ['  none yet']),
	].join('\n')
}

/** Copies the report to the clipboard and says so. */
export function copyReport(): void {
	try {
		Clipboard.setString(buildReport())
		toast('Report copied. Paste it in the chat.')
	} catch {
		toast('Could not copy')
	}
}

/**
 * Checks the plugin's pieces and calls `done` with what it found.
 *
 * The round trip re-sends your own current status and reads it back, so nothing visible changes.
 */
export function runSelfCheck(done: (results: Check[]) => void): void {
	const results: Check[] = []
	const add = (ok: boolean, label: string, detail?: string) =>
		results.push({ ok, label, detail })
	const s = settingsModules()
	add(
		!!s,
		'Found Discord’s status settings',
		s
			? 'UserSettings: StatusSetting, StatusExpiresAtSetting, StatusCreatedAtSetting, CustomStatusSetting'
			: 'Without them nothing can be applied',
	)
	if (s) {
		for (const name of [
			'StatusSetting',
			'StatusExpiresAtSetting',
			'StatusCreatedAtSetting',
			'CustomStatusSetting',
		] as const) {
			add(
				typeof s[name].updateSetting === 'function' &&
					typeof s[name].getSetting === 'function',
				`${name} can be read and written`,
				'',
			)
		}
	}
	const now = readNow()
	let presence: string | undefined
	try {
		presence = (
			Stores as unknown as { SelfPresenceStore: { getStatus(): string } }
		).SelfPresenceStore.getStatus()
	} catch {
		// The presence store is not available.
	}
	add(
		!presence || presence === now.status,
		'Both ways of reading your status agree',
		`settings: ${now.status}; presence store: ${presence || 'not found'}`,
	)
	add(
		found.sheet > 0,
		'Account sheet found',
		found.sheet > 0
			? `seen ${found.sheet} time(s)`
			: 'Open your account sheet (You tab, tap your avatar) once, then run this again',
	)
	add(
		found.editor > 0,
		'"Set your status" screen found',
		found.editor > 0
			? `seen ${found.editor} time(s)`
			: 'Open it once (tap your custom status), then run this again',
	)
	const presets = readPresets()
	add(presets.length > 0, 'Presets saved', `${presets.length} preset(s)`)
	if (!s) {
		done(results)
		return
	}

	try {
		write(s.StatusSetting, now.status, 'Status')
		setTimeout(() => {
			const after = readNow()
			add(
				after.status === now.status,
				'Round trip: Discord keeps what was written',
				`wrote ${now.status}, read back ${after.status}`,
			)
			done(results)
		}, 600)
	} catch (error) {
		add(
			false,
			'Round trip: Discord keeps what was written',
			(error as { message?: unknown } | undefined)?.message
				? String((error as { message: unknown }).message)
				: String(error),
		)
		done(results)
	}
}
