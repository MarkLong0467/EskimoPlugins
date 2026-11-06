import { WEEKDAYS_SHORT } from './constants'
import type { Profile, Repeat } from './types'

/**
 * Everything about time for the timers and the schedule. It has no Discord code, so each rule is easy to test.
 *
 * A "date" is milliseconds since 1970 as the rest of the plugin uses them. A "time of day" is minutes after midnight.
 */

export const SECOND = 1000
export const MINUTE = 60 * SECOND
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/** When Discord was opened, as far as this plugin can tell (when it started). */
let appStartedAt = Date.now()

/** Notes that the app was just opened. Called when the plugin starts. */
export function markAppStart(at = Date.now()): void {
	appStartedAt = at
}

/** When Discord was opened (milliseconds). */
export const appStart = (): number => appStartedAt

/** A number with a leading zero if it is below 10. */
export const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`)

/**
 * A date typed by a person.
 *
 * It reads a Unix time (seconds or milliseconds), `2026-12-25`, `2026-12-25 18:30` and `2026-12-25T18:30:15` as local time,
 * and anything else the phone's own date reader understands (such as `Dec 25, 2026 6:30 PM`).
 *
 * @returns Milliseconds, or nothing if it is not a date.
 */
export function parseDate(value: unknown): number | undefined {
	const s = String(value == null ? '' : value).trim()
	if (!s) return undefined
	if (/^\d+$/.test(s)) {
		const n = Number(s)
		return n < 1e12 ? n * 1000 : n
	}
	const iso =
		/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(
			s,
		)
	if (iso) {
		const [, y, mo, d, h, mi, sec] = iso
		const date = new Date(
			Number(y),
			Number(mo) - 1,
			Number(d),
			Number(h || 0),
			Number(mi || 0),
			Number(sec || 0),
		)
		// A date that does not exist (the 31st of February) rolls over in JavaScript; here it is not a date.
		if (
			date.getFullYear() !== Number(y) ||
			date.getMonth() !== Number(mo) - 1 ||
			date.getDate() !== Number(d)
		)
			return undefined
		return date.getTime()
	}
	const t = Date.parse(s)
	return Number.isNaN(t) ? undefined : t
}

/**
 * A time of day typed by a person: `9:30`, `09:30`, `21:05`, `9pm`, `9:30 pm`, `12am`.
 *
 * @returns Minutes after midnight, or nothing if it is not a time.
 */
export function parseClock(value: unknown): number | undefined {
	const s = String(value == null ? '' : value)
		.trim()
		.toLowerCase()
	const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(s)
	if (!m) return undefined
	let hours = Number(m[1])
	const minutes = Number(m[2] || 0)
	if (minutes > 59) return undefined
	if (m[3]) {
		if (hours < 1 || hours > 12) return undefined
		hours = (hours % 12) + (m[3][0] === 'p' ? 12 : 0)
	} else if (hours > 23) return undefined
	return hours * 60 + minutes
}

/** The time of day written as `9:30 PM`. */
export function clockText(minutes: number): string {
	const h24 = Math.floor(minutes / 60) % 24
	const h = h24 % 12 === 0 ? 12 : h24 % 12
	return `${h}:${pad(minutes % 60)} ${h24 < 12 ? 'AM' : 'PM'}`
}

/** A date written for a person: `Fri, Dec 25 2026, 6:30 PM`. */
export function dateText(at: number): string {
	const d = new Date(at)
	const month = d.toLocaleString('en-US', { month: 'short' })
	return `${WEEKDAYS_SHORT[d.getDay()]}, ${month} ${d.getDate()} ${d.getFullYear()}, ${clockText(d.getHours() * 60 + d.getMinutes())}`
}

/** How far away a date is, in words: `in 3 days`, `2 hours ago`, `in a moment`. */
export function relativeText(at: number, now = Date.now()): string {
	const diff = at - now
	const abs = Math.abs(diff)
	if (abs < MINUTE) return diff >= 0 ? 'in a moment' : 'just now'
	let text: string
	if (abs < HOUR) text = `${Math.round(abs / MINUTE)} min`
	else if (abs < 2 * DAY) text = `${Math.round(abs / HOUR)} h`
	else if (abs < 60 * DAY) text = `${Math.round(abs / DAY)} days`
	else if (abs < 700 * DAY) text = `${Math.round(abs / (30 * DAY))} months`
	else text = `${(abs / (365 * DAY)).toFixed(1)} years`
	return diff >= 0 ? `in ${text}` : `${text} ago`
}

/** A length of time as `3:05`, `1:03:05` or `2d 3:05:00`. */
export function durationText(ms: number): string {
	const total = Math.max(0, Math.floor(ms / SECOND))
	const days = Math.floor(total / 86400)
	const h = Math.floor((total % 86400) / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = total % 60
	if (days) return `${days}d ${h}:${pad(m)}:${pad(s)}`
	return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** The start of the day (local midnight) that `at` is in. */
export function startOfDay(at: number): number {
	const d = new Date(at)
	d.setHours(0, 0, 0, 0)
	return d.getTime()
}

/** The next local midnight after `at`. */
export function nextMidnight(at: number): number {
	const d = new Date(at)
	d.setHours(24, 0, 0, 0)
	return d.getTime()
}

/** A date moved on by whole months, keeping the day of the month when it can (the 31st becomes the last day of a short month). */
function addMonths(at: number, months: number): number {
	const d = new Date(at)
	const day = d.getDate()
	d.setDate(1)
	d.setMonth(d.getMonth() + months)
	const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
	d.setDate(Math.min(day, last))
	return d.getTime()
}

/**
 * The next time a date comes round: the date itself if it is still ahead, else the next one in its repeat.
 *
 * Months and years are counted from the date itself, so a date on the 31st goes to the 28th of February and back to the 31st
 * of March rather than staying on the 28th.
 *
 * @returns Milliseconds, or nothing if the date has passed and does not repeat.
 */
export function nextOccurrence(
	at: number,
	repeat: Repeat,
	now: number,
): number | undefined {
	if (at > now) return at
	if (repeat === 'none') return undefined
	if (repeat === 'daily' || repeat === 'weekly') {
		const step = repeat === 'daily' ? DAY : 7 * DAY
		let next = at + Math.max(0, Math.floor((now - at) / step) - 1) * step
		// A day can be 23 or 25 hours long where the clocks change, so the date is moved by calendar days.
		for (let i = 0; i < 10 && next <= now; i++) {
			const d = new Date(next)
			d.setDate(d.getDate() + (repeat === 'daily' ? 1 : 7))
			next = d.getTime()
		}
		return next > now ? next : undefined
	}
	const size = repeat === 'monthly' ? 1 : 12
	const from = new Date(at)
	const to = new Date(now)
	let k =
		Math.floor(
			((to.getFullYear() - from.getFullYear()) * 12 +
				to.getMonth() -
				from.getMonth()) /
				size,
		) * size
	k = Math.max(size, k)
	let next = addMonths(at, k)
	for (let i = 0; i < 24 && next <= now; i++) next = addMonths(at, (k += size))
	return next > now ? next : undefined
}

/** The window of a daily time range that is on at `now`, or the next one. Ranges can run past midnight. */
export interface DailyWindow {
	start: number
	end: number
	/** Whether `now` is inside it. */
	inside: boolean
}

/**
 * Where a daily range of times of day (such as 9:00 to 17:00, or 22:00 to 6:00) is at `now`.
 *
 * @param from The start, in minutes after midnight.
 * @param to The end. At or before the start it runs into the next day. Equal times are the whole day.
 */
export function dailyWindow(
	from: number,
	to: number,
	now: number,
): DailyWindow {
	const midnight = startOfDay(now)
	const at = (day: number, minutes: number) => {
		const d = new Date(midnight)
		d.setDate(d.getDate() + day)
		d.setHours(0, minutes, 0, 0)
		return d.getTime()
	}
	const length =
		to === from ? 24 * 60 : to > from ? to - from : to + 24 * 60 - from
	// Yesterday's range may still be running (a range that passes midnight), then today's, then tomorrow's.
	for (const day of [-1, 0, 1]) {
		const start = at(day, from)
		const end = start + length * MINUTE
		if (now < end) return { start, end, inside: now >= start }
	}
	const start = at(2, from)
	return { start, end: start + length * MINUTE, inside: false }
}

/** The part of a daily range's day that decides which weekday it belongs to: the day it starts on. */
const weekdayOf = (at: number): number => new Date(at).getDay()

/**
 * Whether a profile's schedule lets it show at `now`. With the schedule off, always. The days are the days a range
 * starts on, so 10 PM to 6 AM on Friday runs into Saturday morning.
 */
export function scheduleAllows(p: Profile, now: number): boolean {
	if (!p.scheduleOn) return true
	const days =
		Array.isArray(p.scheduleDays) && p.scheduleDays.length === 7
			? p.scheduleDays
			: [true, true, true, true, true, true, true]
	if (!days.some(Boolean)) return false
	const from = parseClock(p.scheduleFrom)
	const to = parseClock(p.scheduleTo)
	// With no times, the days alone decide.
	if (from === undefined || to === undefined) return !!days[weekdayOf(now)]
	const w = dailyWindow(from, to, now)
	return w.inside && !!days[weekdayOf(w.start)]
}

/** When the schedule next changes whether the profile may show, or nothing if it never does (always on, or never on). */
export function scheduleChange(p: Profile, now: number): number | undefined {
	if (!p.scheduleOn) return undefined
	const from = parseClock(p.scheduleFrom)
	const to = parseClock(p.scheduleTo)
	const days =
		Array.isArray(p.scheduleDays) && p.scheduleDays.length === 7
			? p.scheduleDays
			: [true, true, true, true, true, true, true]
	if (!days.some(Boolean)) return undefined
	// With no times, the days change at midnight.
	if (from === undefined || to === undefined) return nextMidnight(now)
	const w = dailyWindow(from, to, now)
	return w.inside ? w.end : w.start
}

/** A schedule in words: `Mon, Tue, Wed 9:00 AM to 5:00 PM`. */
export function scheduleText(p: Profile): string {
	const days =
		Array.isArray(p.scheduleDays) && p.scheduleDays.length === 7
			? p.scheduleDays
			: [true, true, true, true, true, true, true]
	const on = days.map((v, i) => (v ? i : -1)).filter(i => i >= 0)
	const dayText =
		on.length === 7
			? 'Every day'
			: on.length === 0
				? 'No days'
				: on.join('') === '12345'
					? 'Weekdays'
					: on.join('') === '06'
						? 'Weekends'
						: on.map(i => WEEKDAYS_SHORT[i]).join(', ')
	const from = parseClock(p.scheduleFrom)
	const to = parseClock(p.scheduleTo)
	if (from === undefined || to === undefined) return `${dayText}, all day`
	return `${dayText}, ${clockText(from)} to ${clockText(to)}`
}
