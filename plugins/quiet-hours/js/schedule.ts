import { MIN_WINDOW_MINUTES } from './constants'
import type { MinuteOfDay, Window } from './types'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** The time of day, in milliseconds, on the calendar day `days` after the day of `base`. */
function atMinute(base: number, days: number, minute: MinuteOfDay): number {
	const d = new Date(base)
	d.setDate(d.getDate() + days)
	d.setHours(Math.floor(minute / 60), minute % 60, 0, 0)
	return d.getTime()
}

/** Whether the schedule gives any window: some day is on and the two times differ. */
export function isUsable(
	days: boolean[],
	from: MinuteOfDay,
	to: MinuteOfDay,
): boolean {
	return days.some(Boolean) && Math.abs(from - to) >= MIN_WINDOW_MINUTES
}

/**
 * The window that starts on the calendar day `offset` days from the day of `now`, or nothing if that weekday is off.
 * A window belongs to the day it starts on, so with "Friday" on and 11 PM to 7 AM it ends on Saturday morning.
 */
export function windowOn(
	now: number,
	offset: number,
	days: boolean[],
	from: MinuteOfDay,
	to: MinuteOfDay,
): Window | null {
	const weekday = new Date(atMinute(now, offset, 12 * 60)).getDay()
	if (!days[weekday]) return null
	const start = atMinute(now, offset, from)
	const end = atMinute(now, offset + (to > from ? 0 : 1), to)
	return end > start ? { start, end } : null
}

/**
 * The window that is on at `now`, or the next one to start.
 *
 * @returns The window and whether `now` is inside it, or nothing if the schedule has no windows at all.
 */
export function windowAt(
	now: number,
	days: boolean[],
	from: MinuteOfDay,
	to: MinuteOfDay,
): { window: Window; inside: boolean } | null {
	if (!isUsable(days, from, to)) return null
	let next: Window | null = null
	// A window that started yesterday can still be on, so start from -1 and look a week and a day ahead.
	for (let offset = -1; offset <= 8; offset++) {
		const w = windowOn(now, offset, days, from, to)
		if (!w) continue
		if (w.start <= now && now < w.end) return { window: w, inside: true }
		if (w.start > now && (!next || w.start < next.start)) next = w
	}
	return next ? { window: next, inside: false } : null
}

/** How long a window lasts, in milliseconds. */
export function lengthOf(window: Window): number {
	return window.end - window.start
}

/** `1 h 30 min` for a stretch of time. */
export function durationText(ms: number): string {
	const minutes = Math.max(0, Math.round(ms / MINUTE))
	const h = Math.floor(minutes / 60)
	const m = minutes % 60
	if (h && m) return `${h} h ${m} min`
	if (h) return `${h} h`
	return `${m} min`
}

/** `11:00 PM` for a minute of the day. */
export function minuteText(minute: MinuteOfDay): string {
	const h24 = Math.floor(minute / 60) % 24
	const m = minute % 60
	const h = h24 % 12 === 0 ? 12 : h24 % 12
	return `${h}:${m < 10 ? `0${m}` : m} ${h24 < 12 ? 'AM' : 'PM'}`
}

/** `3:05 PM` for a time in milliseconds. */
export function clockOf(at: number): string {
	const d = new Date(at)
	return minuteText(d.getHours() * 60 + d.getMinutes())
}

/** `Today`, `Tomorrow`, or the weekday for a time in milliseconds. */
export function dayOf(at: number, now = Date.now()): string {
	const a = new Date(at)
	const startOfToday = atMinute(now, 0, 0)
	const days = Math.round((atMinute(at, 0, 0) - startOfToday) / DAY)
	if (days === 0) return 'Today'
	if (days === 1) return 'Tomorrow'
	return a.toLocaleString('en-US', { weekday: 'long' })
}

/** `Tomorrow 11:00 PM` for a time in milliseconds. */
export function whenOf(at: number, now = Date.now()): string {
	return `${dayOf(at, now)} ${clockOf(at)}`
}

/** A short summary of the days that are on: `Every night`, `Weeknights`, `Weekends`, or the day names. */
export function daysText(days: boolean[]): string {
	const on = days.map((v, i) => (v ? i : -1)).filter(i => i >= 0)
	if (on.length === 0) return 'No days'
	if (on.length === 7) return 'Every night'
	const key = on.join('')
	if (key === '12345') return 'Weekdays'
	if (key === '06') return 'Weekends'
	const short = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
	return on.map(i => short[i]).join(', ')
}
