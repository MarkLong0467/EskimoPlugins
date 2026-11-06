/**
 * Elapsed-time helpers for the "Start time" and "End time" action sheets.
 *
 * Values are stored as epoch milliseconds. The sheets accept either a duration
 * (`1d 7h 20m 40s`, `90m`, `45`) or a wall-clock time (`14:30`, `9:05 pm`).
 * Durations count backwards from a start time and forwards from an end time, so
 * the two directions are handled explicitly rather than by negating.
 */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const START_PRESETS: Array<{ label: string; ms: number }> = [
	{ label: 'Now', ms: 0 },
	{ label: '5 minutes ago', ms: 5 * MINUTE },
	{ label: '15 minutes ago', ms: 15 * MINUTE },
	{ label: '1 hour ago', ms: HOUR },
	{ label: '3 hours ago', ms: 3 * HOUR },
	{ label: 'Yesterday', ms: DAY },
]

/**
 * End presets are *total session lengths*, not offsets from now. Deriving the
 * end from the start this way is what keeps the pair coherent: an end can never
 * land before its start, and a 24h session with a 1h-old start shows 23h.
 */
export const END_PRESETS: Array<{ label: string; ms: number }> = [
	// "None" is a real, selectable state: it clears the end timestamp instead of
	// storing an epoch. Without it there was no way to switch the end back off.
	{ label: 'None', ms: 0 },
	{ label: '30 minutes', ms: 30 * MINUTE },
	{ label: '1 hour', ms: HOUR },
	{ label: '2 hours', ms: 2 * HOUR },
	{ label: '8 hours', ms: 8 * HOUR },
	{ label: '24 hours', ms: DAY },
]

const UNIT_MS: Record<string, number> = {
	ms: 1,
	s: SECOND,
	m: MINUTE,
	h: HOUR,
	d: DAY,
}

/**
 * Parse a duration into milliseconds. Supports compound forms such as
 * `1d 7h 20m 40s`; a bare number is read as minutes. Returns `null` if the input
 * is not a duration.
 *
 * Capture groups rather than splitting on whitespace: splitting `'90m'` that way
 * yields `['9','0','m']`, which reads as a quantity of 9 with no unit.
 */
export function parseDuration(input: string): number | null {
	const text = input.trim().toLowerCase()
	if (!text) return null

	if (!/(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/.test(text)) {
		const bare = Number(text)
		return Number.isFinite(bare) ? bare * MINUTE : null
	}

	let total = 0
	for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/g)) {
		const value = Number(match[1])
		if (!Number.isFinite(value)) return null
		total += value * UNIT_MS[match[2]]
	}
	return total > 0 ? total : null
}

/** Parse `14:30` / `9:05 pm` into epoch ms on the day surrounding `now`. */
export function parseClock(input: string, now: number): number | null {
	const match = input
		.trim()
		.toLowerCase()
		.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/)
	if (!match) return null

	let hours = Number(match[1])
	const minutes = Number(match[2])
	if (minutes > 59) return null
	if (match[3] === 'pm' && hours < 12) hours += 12
	if (match[3] === 'am' && hours === 12) hours = 0
	if (hours > 23) return null

	const target = new Date(now)
	target.setHours(hours, minutes, 0, 0)
	return target.getTime()
}

/**
 * Resolve a start time: durations count back from now, and a clock time later
 * than now means yesterday so the counter never reads negative.
 */
export function parseStartInput(
	input: string,
	now = Date.now(),
): number | null {
	const text = input.trim().toLowerCase()
	if (!text) return null
	if (text === 'now') return now

	const duration = parseDuration(text)
	if (duration !== null) return now - duration

	const clock = parseClock(text, now)
	if (clock === null) return null
	return clock > now ? clock - DAY : clock
}

/**
 * Resolve the end sheet's input into a session *length*. Bare durations are
 * lengths; a clock time is read as an absolute end and converted, so `14:30`
 * with a start one hour ago means a one-hour session.
 */
export function parseLengthInput(
	input: string,
	start: number,
	now = Date.now(),
): number | null {
	const text = input.trim().toLowerCase()
	if (!text) return null

	const duration = parseDuration(text)
	if (duration !== null) return duration

	const clock = parseClock(text, now)
	if (clock === null || !start) return null
	const target = clock <= now ? clock + DAY : clock
	return target > start ? target - start : null
}

/**
 * Total session length implied by a start/end pair. Zero whenever the pair is
 * absent or incoherent, so callers never have to reason about a negative span.
 */
export function sessionLength(start: number, end: number): number {
	if (!start || !end) return 0
	return end > start ? end - start : 0
}

/** Absolute end epoch for a session of `length` ms anchored at `start`. */
export function endFromLength(start: number, length: number): number {
	if (!start || length <= 0) return 0
	return start + length
}

/** `1d 7h 20m 40s` — every non-zero unit, largest first. */
export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / SECOND))
	const days = Math.floor(total / 86400)
	const hours = Math.floor((total % 86400) / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const seconds = total % 60

	const parts: string[] = []
	if (days) parts.push(`${days}d`)
	if (hours) parts.push(`${hours}h`)
	if (minutes) parts.push(`${minutes}m`)
	if (seconds) parts.push(`${seconds}s`)
	return parts.length ? parts.join(' ') : '0s'
}

/** Compact human label for the start row, e.g. `"2h 15m ago"`. */
export function formatElapsed(start: number, now = Date.now()): string {
	if (!start) return 'Now'
	return `${formatDuration(now - start)} ago`
}

/** Compact human label for the end row, e.g. `"in 20m"`. */
export function formatRemaining(end: number, now = Date.now()): string {
	if (!end) return 'None'
	const left = end - now
	return left <= 0 ? 'Ended' : `in ${formatDuration(left)}`
}
