/** Reading the times you type, and writing times out. */

const two = (n: number) => (n < 10 ? `0${n}` : String(n))

const UNITS: Record<string, number> = {
	s: 1000,
	m: 60_000,
	min: 60_000,
	h: 3_600_000,
	d: 86_400_000,
	w: 604_800_000,
}

/**
 * A time typed as `in 10m`, `2h 30m`, `18:30` (the next time it is that time), `tomorrow 9:00` or `2026-12-24 18:00`.
 *
 * @returns The time in milliseconds, or nothing if the text is not a time.
 */
export function parseWhen(text: string, now = Date.now()): number | undefined {
	const t = text.trim().toLowerCase()
	if (!t) return undefined
	const relative = t.replace(/^in\s+/, '')
	if (/^(\d+\s*(s|min|m|h|d|w)\s*)+$/.test(relative)) {
		let total = 0
		for (const [, amount, unit] of relative.matchAll(
			/(\d+)\s*(s|min|m|h|d|w)/g,
		))
			total += Number(amount) * (UNITS[unit as string] ?? 0)
		return total > 0 ? now + total : undefined
	}
	const clock = (part: string): [number, number] | undefined => {
		const m = part.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
		if (!m) return undefined
		let hours = Number(m[1])
		const minutes = Number(m[2] ?? 0)
		if (m[3] === 'pm' && hours < 12) hours += 12
		if (m[3] === 'am' && hours === 12) hours = 0
		if (!m[2] && !m[3]) return undefined
		return hours < 24 && minutes < 60 ? [hours, minutes] : undefined
	}
	const tomorrow = t.match(/^tomorrow(?:\s+(.+))?$/)
	if (tomorrow) {
		const [h, m] = tomorrow[1] ? (clock(tomorrow[1]) ?? [-1, 0]) : [9, 0]
		if (h < 0) return undefined
		const d = new Date(now)
		d.setDate(d.getDate() + 1)
		d.setHours(h, m, 0, 0)
		return d.getTime()
	}
	const only = clock(t)
	if (only) {
		const d = new Date(now)
		d.setHours(only[0], only[1], 0, 0)
		if (d.getTime() <= now) d.setDate(d.getDate() + 1)
		return d.getTime()
	}
	const full = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t](.+))?$/)
	if (full) {
		const [h, m] = full[4] ? (clock(full[4]) ?? [-1, 0]) : [9, 0]
		if (h < 0) return undefined
		const d = new Date(
			Number(full[1]),
			Number(full[2]) - 1,
			Number(full[3]),
			h,
			m,
			0,
			0,
		)
		return Number.isFinite(d.getTime()) ? d.getTime() : undefined
	}
	return undefined
}

/** A time as `Sun 15 Nov, 18:30`. */
export function whenOf(at: number): string {
	const d = new Date(at)
	const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
	const months = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec',
	]
	return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}, ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** A time as it is typed: `2026-11-15 18:30`. */
export function typedOf(at: number): string {
	const d = new Date(at)
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** How far a time is from now: `in 5 min`, `2 h ago`. */
export function relativeOf(at: number, now = Date.now()): string {
	const diff = at - now
	const abs = Math.abs(diff)
	const text =
		abs < 60_000
			? 'less than a minute'
			: abs < 3_600_000
				? `${Math.round(abs / 60_000)} min`
				: abs < 86_400_000
					? `${Math.round(abs / 3_600_000)} h`
					: `${Math.round(abs / 86_400_000)} d`
	return diff >= 0 ? `in ${text}` : `${text} ago`
}
