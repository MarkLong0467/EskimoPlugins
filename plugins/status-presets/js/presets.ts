import { saveSettings, setting } from './config'
import {
	CLEAR_AFTER,
	CUSTOM_MODES,
	DEFAULT_SETTINGS,
	MAX_NAME,
	MAX_TEXT,
	STATUSES,
} from './constants'
import type {
	Choice,
	ClearAfter,
	CustomMode,
	ParsedEmoji,
	Preset,
	StatusValue,
} from './types'

/** Parses JSON text, giving `fallback` when it is not valid or is null. */
export function parseJson<T>(text: unknown, fallback: T): T {
	try {
		const value = JSON.parse(text as string)
		return value === undefined || value === null ? fallback : value
	} catch {
		return fallback
	}
}

/** The name, label and color of a status. An unknown value is shown as "keep my status". */
export const statusInfo = (value: string): Choice =>
	STATUSES.find(s => s.v === value) || STATUSES[0]

/** A value if it is one of the list's values, otherwise the fallback. */
const oneOf = <T extends string>(
	value: unknown,
	list: Choice[],
	fallback: T,
): T => (list.some(o => o.v === value) ? (value as T) : fallback)

/** A new id for a preset. */
export const newId = (): string =>
	`p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`

/** Makes any saved object a safe preset (unknown values fall back to harmless ones). */
export function cleanPreset(raw: unknown): Preset {
	const p = (raw && typeof raw === 'object' ? raw : {}) as Record<
		string,
		unknown
	>
	return {
		id: typeof p.id === 'string' && p.id ? p.id : newId(),
		name: String(p.name == null ? '' : p.name).slice(0, MAX_NAME),
		emoji: String(p.emoji == null ? '' : p.emoji).slice(0, 64),
		text: String(p.text == null ? '' : p.text).slice(0, MAX_TEXT),
		status: oneOf<StatusValue>(p.status, STATUSES, 'keep'),
		custom: oneOf<CustomMode>(p.custom, CUSTOM_MODES, 'keep'),
		clearAfter: oneOf<ClearAfter>(p.clearAfter, CLEAR_AFTER, 'never'),
	}
}

/** The saved presets. Unknown values are made safe and a repeated id is dropped. If nothing valid is saved, the starter presets. */
export function readPresets(): Preset[] {
	const saved = parseJson<unknown>(setting('presetsJson'), null)
	const list = Array.isArray(saved)
		? saved
		: parseJson<unknown[]>(DEFAULT_SETTINGS.presetsJson, [])
	const seen = new Set<string>()
	return list
		.map(cleanPreset)
		.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)))
}

/** Saves the presets. */
export const writePresets = (list: Preset[]): void =>
	saveSettings({ presetsJson: JSON.stringify(list.map(cleanPreset)) })

/**
 * An emoji can be typed as 😴 or pasted as `<:name:123456789012345678>` for a server emoji.
 *
 * @returns The emoji, or nothing if the text is empty.
 */
export function parseEmoji(raw: unknown): ParsedEmoji | null {
	const text = String(raw == null ? '' : raw).trim()
	if (!text) return null
	const custom = text.match(/^<?a?:([A-Za-z0-9_]{2,32}):(\d{15,20})>?$/)
	if (custom) return { id: custom[2], name: custom[1], custom: true }
	return {
		id: null,
		name: Array.from(text).slice(0, 8).join(''),
		custom: false,
	}
}

/** An emoji as text for a label: the emoji itself, or `:name:` for a server emoji. */
export function emojiText(raw: unknown): string {
	const emoji = parseEmoji(raw)
	return emoji ? (emoji.custom ? `:${emoji.name}:` : emoji.name) : ''
}

/** The words for a "clear after" value. */
export const clearLabel = (value: string): string =>
	(CLEAR_AFTER.find(o => o.v === value) || CLEAR_AFTER[0]).l

/**
 * The end time as Discord stores it: milliseconds as text, `0` for never.
 *
 * @param clearAfter One of the `CLEAR_AFTER` values.
 * @param now The time the preset is applied (milliseconds).
 */
export function expiryFor(clearAfter: string, now: number): string {
	if (clearAfter === 'midnight') {
		const end = new Date(now)
		end.setHours(24, 0, 0, 0)
		return String(end.getTime())
	}
	const option = CLEAR_AFTER.find(o => o.v === clearAfter)
	return option?.ms && option.ms > 0 ? String(now + option.ms) : '0'
}

/** A time for a label: just the time if it is today, otherwise the date too. Empty if it is not a time. */
export function timeLabel(ms: unknown): string {
	const date = new Date(Number(ms))
	if (!Number.isFinite(date.getTime())) return ''
	const sameDay = date.toDateString() === new Date().toDateString()
	const time = date.toLocaleTimeString([], {
		hour: 'numeric',
		minute: '2-digit',
	})
	return sameDay
		? time
		: `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

/** One line for a list row: "Do Not Disturb · “Sleeping” · 8 hours". */
export function summary(p: Preset): string {
	const parts: string[] = []
	if (p.status !== 'keep') parts.push(statusInfo(p.status).l)
	if (p.custom === 'set')
		parts.push(
			p.text
				? `“${p.text}”`
				: emojiText(p.emoji)
					? 'emoji only'
					: 'empty custom status',
		)
	else if (p.custom === 'clear') parts.push('removes custom status')
	if ((p.status !== 'keep' && p.status !== 'online') || p.custom === 'set')
		parts.push(
			p.clearAfter === 'never' ? 'no end time' : clearLabel(p.clearAfter),
		)
	return parts.length ? parts.join(' · ') : 'Changes nothing'
}

/** The title of a preset in a list: its emoji (if it is a plain one) and its name. */
export const titleOf = (p: Preset): string =>
	`${emojiText(p.emoji) && !/^:/.test(emojiText(p.emoji)) ? `${emojiText(p.emoji)} ` : ''}${p.name || 'Untitled'}`
