import { saveSettings, setting } from './config'
import { VERIFY_DELAY_MS } from './constants'
import {
	cleanPreset,
	expiryFor,
	newId,
	parseEmoji,
	parseJson,
	statusInfo,
} from './presets'
import { addLog, buzz, lastApplied, toast } from './state'
import { readNow, settingsModules, write } from './status'
import type { CustomStatus, Preset, StatusNow, UndoRecord } from './types'

/** The status to write: `status` and `expires` apply unless the status is `keep`; `custom` is `undefined` to leave it, `null` to remove it. */
interface Target {
	status: string
	expires: string
	custom: CustomStatus | null | undefined
}

/** Writes the status, when it ends, when it started, and the custom status, to Discord's settings. */
function writeState({ status, expires, custom }: Target, now: number): void {
	const s = settingsModules()
	if (!s) throw new Error('Status settings not found')
	if (status && status !== 'keep') {
		write(s.StatusSetting, status, 'Status')
		write(
			s.StatusExpiresAtSetting,
			status === 'online' ? '0' : expires || '0',
			'Status end time',
		)
		write(s.StatusCreatedAtSetting, String(now), 'Status start time')
	}
	if (custom === null) write(s.CustomStatusSetting, undefined, 'Custom status')
	else if (custom) write(s.CustomStatusSetting, custom, 'Custom status')
}

/** The custom status object Discord expects, from a preset (or null when there is nothing to show). */
function customFromPreset(
	p: Preset,
	expiry: string,
	now: number,
): CustomStatus | null {
	const emoji = parseEmoji(p.emoji)
	if (!p.text.trim() && !emoji) return null
	return {
		text: p.text.trim(),
		expiresAtMs: expiry,
		emojiId: emoji?.id ? emoji.id : '0',
		emojiName: emoji ? emoji.name : '',
		createdAtMs: String(now),
	}
}

/** Checks a moment later that Discord's own settings now show what was asked for, and says so in the log. */
function verifyLater(p: Preset): void {
	setTimeout(() => {
		try {
			const now = readNow()
			const problems: string[] = []
			if (p.status !== 'keep' && now.status !== p.status)
				problems.push(`status is ${now.status}`)
			if (p.custom === 'set' && customFromPreset(p, '0', 0) && !now.custom)
				problems.push('custom status is not set')
			if (p.custom === 'clear' && now.custom)
				problems.push('custom status is still there')
			addLog(
				problems.length
					? `${p.name}: asked, but ${problems.join('; ')}`
					: `${p.name}: applied`,
				!problems.length,
			)
			if (problems.length) toast(`${p.name}: Discord has not confirmed yet`)
		} catch (error) {
			addLog(
				`${p.name}: could not check (${(error as { message?: unknown } | undefined)?.message})`,
				false,
			)
		}
	}, VERIFY_DELAY_MS)
}

/**
 * Applies a preset: sets the status and the custom status the way Discord's own screens do.
 *
 * @param preset The preset to apply.
 * @param remember True to keep your old status so "Undo" can bring it back.
 * @returns Whether it was sent to Discord. A preset that changes nothing, or a failure, gives false and a toast.
 */
export function applyPreset(preset: unknown, remember = true): boolean {
	const p = cleanPreset(preset)
	const label = p.name || 'Preset'
	try {
		if (!settingsModules()) {
			toast('Could not find Discord’s status settings')
			addLog(`${label}: status settings not found`, false)
			return false
		}
		if (p.status === 'keep' && p.custom === 'keep') {
			toast(`${label} changes nothing`)
			return false
		}
		const now = Date.now()
		const before = readNow()
		const expiry = expiryFor(p.clearAfter, now)
		if (remember)
			saveSettings({
				undoJson: JSON.stringify({ name: label, at: now, ...before }),
			})
		writeState(
			{
				status: p.status,
				expires: expiry,
				custom:
					p.custom === 'set'
						? customFromPreset(p, expiry, now)
						: p.custom === 'clear'
							? null
							: undefined,
			},
			now,
		)
		lastApplied.id = p.id
		lastApplied.at = now
		buzz()
		toast(`${label} is on`)
		addLog(`${label}: sent to Discord`, true)
		verifyLater(p)
		return true
	} catch (error) {
		toast(`Could not apply ${label}`)
		addLog(
			`${label}: ${(error as { message?: unknown } | undefined)?.message || error}`,
			false,
		)
		return false
	}
}

/** What was saved before the last preset, or nothing. */
export function readUndo(): UndoRecord | null {
	const saved = parseJson<Partial<UndoRecord> | null>(setting('undoJson'), null)
	return saved && typeof saved === 'object' && typeof saved.status === 'string'
		? (saved as UndoRecord)
		: null
}

/**
 * Puts back the status and custom status you had before the last preset. An end time that has passed since is dropped.
 *
 * @returns Whether it was sent to Discord.
 */
export function undoLastPreset(): boolean {
	const saved = readUndo()
	if (!saved) {
		toast('Nothing to undo')
		return false
	}
	try {
		const now = Date.now()
		const stillRunning = (ms: string | undefined) =>
			!ms || ms === '0' || Number(ms) > now
		const custom =
			saved.custom && stillRunning(saved.custom.expiresAtMs)
				? {
						text: saved.custom.text || '',
						expiresAtMs: saved.custom.expiresAtMs || '0',
						emojiId: saved.custom.emojiId || '0',
						emojiName: saved.custom.emojiName || '',
						createdAtMs: String(now),
					}
				: null
		writeState(
			{
				status: saved.status,
				expires: stillRunning(saved.expires) ? saved.expires : '0',
				custom,
			},
			now,
		)
		saveSettings({ undoJson: '' })
		buzz()
		toast('Back to how it was')
		addLog(`Undo ${saved.name || 'preset'}: sent to Discord`, true)
		return true
	} catch (error) {
		toast('Could not undo')
		addLog(
			`Undo: ${(error as { message?: unknown } | undefined)?.message || error}`,
			false,
		)
		return false
	}
}

/** Makes a preset from your status right now. */
export function presetFromNow(): Preset {
	const now = readNow()
	const emoji = now.custom?.emojiName
		? now.custom.emojiId
			? `<:${now.custom.emojiName}:${now.custom.emojiId}>`
			: now.custom.emojiName
		: ''
	return cleanPreset({
		id: newId(),
		name: now.custom?.text
			? now.custom.text.slice(0, 20)
			: statusInfo(now.status).l,
		emoji,
		text: now.custom ? now.custom.text : '',
		status: now.status,
		custom: now.custom ? 'set' : 'clear',
		clearAfter: 'never',
	})
}

/** Whether a preset describes your status right now (so a list can mark it "Active"). */
export function isActive(p: Preset, now: StatusNow): boolean {
	if (p.status === 'keep' && p.custom === 'keep') return false
	if (p.status !== 'keep' && now.status !== p.status) return false
	if (p.custom === 'clear') return !now.custom
	if (p.custom === 'set') {
		const emoji = parseEmoji(p.emoji)
		return (
			!!now.custom &&
			now.custom.text === p.text.trim() &&
			now.custom.emojiName === (emoji ? emoji.name : '')
		)
	}
	return true
}
