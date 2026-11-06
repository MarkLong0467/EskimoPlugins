import type { Choice } from './types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Two digits. */
function two(n: number): string {
	return n < 10 ? `0${n}` : String(n)
}

/** `3:05 PM` for a time. */
export function clockOf(at: number): string {
	const d = new Date(at)
	const hours = d.getHours()
	const h = hours % 12 === 0 ? 12 : hours % 12
	return `${h}:${two(d.getMinutes())} ${hours < 12 ? 'AM' : 'PM'}`
}

/** Whether two times are on the same calendar day. */
function sameDay(a: number, b: number): boolean {
	const x = new Date(a)
	const y = new Date(b)
	return (
		x.getFullYear() === y.getFullYear() &&
		x.getMonth() === y.getMonth() &&
		x.getDate() === y.getDate()
	)
}

/** `Today 3:05 PM`, `Tomorrow 9:00 AM` or `Nov 9, 3:05 PM`. */
export function whenOf(at: number, now = Date.now()): string {
	if (sameDay(at, now)) return `Today ${clockOf(at)}`
	if (sameDay(at, now + DAY)) return `Tomorrow ${clockOf(at)}`
	const d = new Date(at)
	const month = d.toLocaleString('en-US', { month: 'short' })
	return `${month} ${d.getDate()}, ${clockOf(at)}`
}

/** `in 12 min`, `in 3 h`, `in 5 days`, or `5 min ago` for a time that has passed. */
export function relativeOf(at: number, now = Date.now()): string {
	const diff = at - now
	const abs = Math.abs(diff)
	if (abs < MINUTE) return diff >= 0 ? 'in a moment' : 'just now'
	let text: string
	if (abs < HOUR) text = `${Math.round(abs / MINUTE)} min`
	else if (abs < 2 * DAY) text = `${Math.round(abs / HOUR)} h`
	else text = `${Math.round(abs / DAY)} days`
	return diff >= 0 ? `in ${text}` : `${text} ago`
}

/** The time at the given hour of the day that is `days` from today. */
function atHour(now: number, days: number, hour: number): number {
	const d = new Date(now)
	d.setDate(d.getDate() + days)
	d.setHours(hour, 0, 0, 0)
	return d.getTime()
}

/**
 * The times the picker offers. "This evening" (8 PM) is left out when it is less than two hours away or already past.
 * "Tomorrow morning" and "In a week" are 9 AM.
 */
export function choices(now = Date.now()): Choice[] {
	const out: Choice[] = [
		{ label: 'In 10 minutes', at: now + 10 * MINUTE },
		{ label: 'In 30 minutes', at: now + 30 * MINUTE },
		{ label: 'In 1 hour', at: now + HOUR },
		{ label: 'In 3 hours', at: now + 3 * HOUR },
	]
	const evening = atHour(now, 0, 20)
	if (evening - now > 2 * HOUR) out.push({ label: 'This evening', at: evening })
	out.push({ label: 'Tomorrow morning', at: atHour(now, 1, 9) })
	out.push({ label: 'In a week', at: atHour(now, 7, 9) })
	return out
}

/** The time that is the given number of minutes from now, or nothing if the text is no use as a number of minutes. */
export function afterMinutes(
	text: string,
	max: number,
	now = Date.now(),
): number | null {
	const minutes = Number(text.trim())
	if (!Number.isFinite(minutes) || minutes < 1 || minutes > max) return null
	return now + Math.round(minutes) * MINUTE
}
