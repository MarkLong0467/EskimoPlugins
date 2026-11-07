/**
 * Everything about time that does not touch Discord: the seven kinds of Discord timestamp, reading a time someone typed
 * ("tomorrow 9am", "in 2h", "2026-12-25 18:00"), moving a time with the steppers, and showing it.
 *
 * A moment is milliseconds since 1970. The only place a time zone matters is turning the numbers someone sees (year, month,
 * day, hour, minute) into a moment and back. A zone is `'device'` (the phone's own) or a fixed offset in minutes east of UTC.
 */

/** The seven styles Discord has for `<t:seconds:style>`. */
export type Style = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R'

/** The phone's own time zone, or a fixed number of minutes east of UTC. */
export type Zone = 'device' | number

/** One style, with what to call it. */
export interface StyleInfo {
	id: Style
	name: string
	/** A few words on how it reads. */
	about: string
}

/** The styles, in the order Discord lists them. */
export const STYLES: StyleInfo[] = [
	{
		id: 'f',
		name: 'Date and time',
		about: 'Discord’s default, like Nov 7, 2026 6:30 PM',
	},
	{ id: 'F', name: 'Full date and time', about: 'With the weekday' },
	{ id: 'R', name: 'Relative', about: 'Counts live: in 2 hours, 3 days ago' },
	{ id: 't', name: 'Time', about: 'Just the time' },
	{ id: 'T', name: 'Time with seconds', about: 'The time to the second' },
	{ id: 'd', name: 'Short date', about: 'Just the date, as numbers' },
	{
		id: 'D',
		name: 'Long date',
		about: 'Just the date, with the month spelled out',
	},
]

/** Whether something is one of the style letters. */
export const isStyle = (value: unknown): value is Style =>
	typeof value === 'string' && STYLES.some(style => style.id === value)

/** The name of a style. */
export const styleName = (id: Style): string =>
	STYLES.find(style => style.id === id)?.name ?? id

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
]
const DAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
]

/** The calendar numbers of a moment, in a zone. `month` counts from 0 and `weekday` from Sunday, as in `Date`. */
export interface Parts {
	year: number
	month: number
	day: number
	hour: number
	minute: number
	second: number
	weekday: number
}

/** The numbers someone would read off a clock and a calendar in `zone` at `moment`. */
export function partsOf(moment: number, zone: Zone): Parts {
	if (zone === 'device') {
		const d = new Date(moment)
		return {
			year: d.getFullYear(),
			month: d.getMonth(),
			day: d.getDate(),
			hour: d.getHours(),
			minute: d.getMinutes(),
			second: d.getSeconds(),
			weekday: d.getDay(),
		}
	}
	const d = new Date(moment + zone * 60000)
	return {
		year: d.getUTCFullYear(),
		month: d.getUTCMonth(),
		day: d.getUTCDate(),
		hour: d.getUTCHours(),
		minute: d.getUTCMinutes(),
		second: d.getUTCSeconds(),
		weekday: d.getUTCDay(),
	}
}

/** The moment at which the clocks in `zone` show these numbers. Numbers out of range carry over (day 32 is the next month). */
export function momentOf(
	parts: Omit<Parts, 'weekday' | 'second'> & { second?: number },
	zone: Zone,
): number {
	const second = parts.second ?? 0
	if (zone === 'device')
		return new Date(
			parts.year,
			parts.month,
			parts.day,
			parts.hour,
			parts.minute,
			second,
		).getTime()
	return (
		Date.UTC(
			parts.year,
			parts.month,
			parts.day,
			parts.hour,
			parts.minute,
			second,
		) -
		zone * 60000
	)
}

/** How many days a month has. */
export const daysIn = (year: number, month: number): number =>
	new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

/** The moment moved by whole calendar units in `zone`. Months and years keep the day, or the last day of a shorter month. */
export function shift(
	moment: number,
	zone: Zone,
	unit: 'year' | 'month' | 'day' | 'hour' | 'minute',
	amount: number,
): number {
	const p = partsOf(moment, zone)
	if (unit === 'hour') return moment + amount * 3600000
	if (unit === 'minute') return moment + amount * 60000
	if (unit === 'day') return momentOf({ ...p, day: p.day + amount }, zone)
	const month = unit === 'year' ? p.month : p.month + amount
	const year = unit === 'year' ? p.year + amount : p.year
	const first = new Date(Date.UTC(year, month, 1))
	const day = Math.min(
		p.day,
		daysIn(first.getUTCFullYear(), first.getUTCMonth()),
	)
	return momentOf(
		{ ...p, year: first.getUTCFullYear(), month: first.getUTCMonth(), day },
		zone,
	)
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** "UTC+05:30", or "UTC" for no offset. */
export function offsetName(minutes: number): string {
	if (minutes === 0) return 'UTC'
	const sign = minutes < 0 ? '-' : '+'
	const abs = Math.abs(minutes)
	return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** The phone's offset from UTC now, in minutes east. */
export const deviceOffset = (moment: number): number =>
	-new Date(moment).getTimezoneOffset()

/** The name of a zone for the screen. */
export const zoneName = (zone: Zone, moment: number = Date.now()): string =>
	zone === 'device'
		? `This phone (${offsetName(deviceOffset(moment))})`
		: offsetName(zone)

/** The clock of a moment: "6:30 PM", or "18:30" in 24-hour. */
export function clock(parts: Parts, h24: boolean, seconds = false): string {
	const tail = seconds ? `:${pad(parts.second)}` : ''
	if (h24) return `${pad(parts.hour)}:${pad(parts.minute)}${tail}`
	const hour = parts.hour % 12 === 0 ? 12 : parts.hour % 12
	return `${hour}:${pad(parts.minute)}${tail} ${parts.hour < 12 ? 'AM' : 'PM'}`
}

/** Words for how far a moment is from now, in the way Discord's relative style reads: "in 2 hours", "3 days ago". */
export function relative(moment: number, now: number = Date.now()): string {
	const diff = moment - now
	const abs = Math.abs(diff)
	const seconds = Math.round(abs / 1000)
	const minutes = Math.round(abs / 60000)
	const hours = Math.round(abs / 3600000)
	const days = Math.round(abs / 86400000)
	const months = Math.round(abs / (86400000 * 30.4375))
	const years = Math.round(abs / (86400000 * 365.25))
	let text: string
	if (seconds < 45) text = 'a few seconds'
	else if (seconds < 90) text = 'a minute'
	else if (minutes < 45) text = `${minutes} minutes`
	else if (minutes < 90) text = 'an hour'
	else if (hours < 22) text = `${hours} hours`
	else if (hours < 36) text = 'a day'
	else if (days < 26) text = `${days} days`
	else if (days < 46) text = 'a month'
	else if (days < 320) text = `${months} months`
	else if (days < 548) text = 'a year'
	else text = `${years} years`
	if (seconds < 45) return diff >= 0 ? 'in a few seconds' : 'a few seconds ago'
	return diff >= 0 ? `in ${text}` : `${text} ago`
}

/**
 * What a style looks like, written the way Discord's English shows it. Discord draws the real thing for each reader in their own
 * language and time zone; this is a preview, in the phone's zone like what you will see yourself.
 */
export function preview(
	moment: number,
	style: Style,
	h24: boolean,
	now: number = Date.now(),
): string {
	const p = partsOf(moment, 'device')
	const month = MONTHS[p.month] ?? ''
	switch (style) {
		case 't':
			return clock(p, h24)
		case 'T':
			return clock(p, h24, true)
		case 'd':
			return `${pad(p.month + 1)}/${pad(p.day)}/${p.year}`
		case 'D':
			return `${month} ${p.day}, ${p.year}`
		case 'f':
			return `${month} ${p.day}, ${p.year} ${clock(p, h24)}`
		case 'F':
			return `${DAYS[p.weekday]}, ${month} ${p.day}, ${p.year} ${clock(p, h24)}`
		case 'R':
			return relative(moment, now)
	}
}

/** A moment as it reads in a zone, for the date and time rows: "Sat 7 Nov 2026" and "6:30 PM". */
export function readout(
	moment: number,
	zone: Zone,
	h24: boolean,
): { date: string; time: string } {
	const p = partsOf(moment, zone)
	return {
		date: `${(DAYS[p.weekday] ?? '').slice(0, 3)} ${p.day} ${(MONTHS[p.month] ?? '').slice(0, 3)} ${p.year}`,
		time: clock(p, h24),
	}
}

/** Discord's tag for a moment: `<t:1794000000:F>`. Seconds, not milliseconds. */
export const tag = (moment: number, style: Style): string =>
	`<t:${Math.floor(moment / 1000)}:${style}>`

/** How a message is made from a moment. */
export interface ComposeOptions {
	style: Style
	/** Add the relative style after it, like `<t:1:F> (<t:1:R>)`. */
	alsoRelative: boolean
	/** Wrap the tag in backticks so chat shows the raw `<t:...>` text instead of the time. */
	code: boolean
	/** Text around the time. `{time}` is replaced by the tag, and without it the tag goes on the end. */
	message: string
}

/** The message to send, insert or copy. */
export function compose(moment: number, options: ComposeOptions): string {
	let time = tag(moment, options.style)
	if (options.alsoRelative && options.style !== 'R')
		time += ` (${tag(moment, 'R')})`
	if (options.code) time = `\`${time}\``
	const template = options.message.trim()
	if (!template) return time
	return template.includes('{time}')
		? template.split('{time}').join(time)
		: `${template} ${time}`
}

// ---- reading a time somebody typed ----

/** What the reader needs to know about the person's habits. */
export interface ReadOptions {
	zone: Zone
	/** Whether 3/4 is March 4th (`'mdy'`) or the 3rd of April (`'dmy'`). */
	order: 'mdy' | 'dmy'
	/** A time with no day ("5pm") that has already passed today means tomorrow. */
	rollForward: boolean
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const MONTH_KEYS = [
	'jan',
	'feb',
	'mar',
	'apr',
	'may',
	'jun',
	'jul',
	'aug',
	'sep',
	'oct',
	'nov',
	'dec',
]

/** A unit of the typed offsets ("2h", "3 days"), in milliseconds, or the calendar unit for months and years (`times` of them). */
function unitOf(
	word: string,
): { ms?: number; unit?: 'month' | 'year'; times?: number } | undefined {
	const w = word.toLowerCase()
	if (/^(s|sec|secs|second|seconds)$/.test(w)) return { ms: 1000 }
	if (/^(m|min|mins|minute|minutes)$/.test(w)) return { ms: 60000 }
	if (/^(h|hr|hrs|hour|hours)$/.test(w)) return { ms: 3600000 }
	if (/^(d|day|days)$/.test(w)) return { ms: 86400000 }
	if (/^(w|wk|wks|week|weeks)$/.test(w)) return { ms: 7 * 86400000 }
	if (/^(fortnight|fortnights)$/.test(w)) return { ms: 14 * 86400000 }
	if (/^(mo|mos|month|months)$/.test(w)) return { unit: 'month' }
	if (/^(q|quarter|quarters)$/.test(w)) return { unit: 'month', times: 3 }
	if (/^(y|yr|yrs|year|years)$/.test(w)) return { unit: 'year' }
	if (/^(decade|decades)$/.test(w)) return { unit: 'year', times: 10 }
	return undefined
}

const NUMBER_WORDS: Record<string, number> = {
	a: 1,
	an: 1,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	fifteen: 15,
	twenty: 20,
	thirty: 30,
	forty: 40,
	fifty: 50,
	sixty: 60,
	ninety: 90,
	couple: 2,
	few: 3,
	several: 4,
}

/** The words for a unit, as they follow a number. */
const UNIT_WORDS =
	'(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|fortnights?|months?|quarters?|years?|yrs?|decades?)'

/** Days of the year that people name, as `[month from 0, day, hour or nothing for noon]`. */
const HOLIDAYS: Array<[RegExp, number, number, number?]> = [
	[/\bchristmas eve\b/, 11, 24],
	[/\b(?:christmas|xmas)\b/, 11, 25],
	[/\bnew years? eve\b/, 11, 31],
	[/\bnew years?(?: day)?\b/, 0, 1, 0],
	[/\bhalloween\b/, 9, 31],
	[/\bvalentines?(?: day)?\b/, 1, 14],
	[/\bindependence day\b/, 6, 4],
	[/\bapril fools(?: day)?\b/, 3, 1],
]

/** Turns the words people say ("a couple of weeks", "half an hour", "an hour and a half") into numbers and units. */
function plainNumbers(text: string): string {
	let out = text
		.replace(/\bhalf (?:an?|one) hour\b/g, ' 30 minutes ')
		.replace(/\b(?:a )?quarter (?:of )?(?:an? )?hour\b/g, ' 15 minutes ')
		.replace(/\bhalf (?:a |one )?day\b/g, ' 12 hours ')
		.replace(/\bhalf (?:a |one )?month\b/g, ' 15 days ')
		.replace(/\bhalf (?:a |one )?year\b/g, ' 6 months ')
		.replace(/\ba couple of\b/g, ' two ')
		.replace(/\bcouple of\b/g, ' two ')
		.replace(/\ba few\b/g, ' three ')
		.replace(
			new RegExp(
				`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b(?=(?: and a half)?\\s+${UNIT_WORDS}\\b)`,
				'g',
			),
			(_, word: string) => ` ${NUMBER_WORDS[word] ?? 1} `,
		)
	out = out.replace(
		new RegExp(
			`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORDS}|[a-z]{1,3}) and a half\\b`,
			'g',
		),
		(_, n: string, unit: string) => ` ${Number(n) + 0.5} ${unit} `,
	)
	// "2 and a half hours"
	out = out.replace(
		new RegExp(`(\\d+) and a half\\s+(${UNIT_WORDS})\\b`, 'g'),
		(_, n: string, unit: string) => ` ${Number(n) + 0.5} ${unit} `,
	)
	return out
}

/**
 * Reads a time someone typed. Understands (in any mix, any order, upper or lower case):
 * - `now`, a Unix number (`1794000000`),
 * - offsets: `in 2 hours`, `+30m`, `1d12h`, `3 days ago`, `-2w`,
 * - days: `today`, `tomorrow`, `yesterday`, `tonight`, `friday`, `next friday`, `next week`, `next month`,
 * - clocks: `5pm`, `5:30 pm`, `17:30`, `noon`, `midnight`,
 * - dates: `2026-12-25`, `12/25`, `25.12.2026`, `dec 25`, `25 december 2026`.
 *
 * @returns The moment, or nothing if some of the words were not understood.
 */
export function readTime(
	input: string,
	now: number,
	options: ReadOptions,
): number | undefined {
	let text = ` ${input.toLowerCase().replace(/[,@]/g, ' ')} `.replace(
		/\s+/g,
		' ',
	)
	if (text.trim() === '') return undefined
	const zone = options.zone

	const take = (pattern: RegExp): RegExpMatchArray | undefined => {
		const found = text.match(pattern)
		if (!found) return undefined
		text = text.replace(pattern, ' ')
		return found
	}

	// A Unix number on its own.
	const unix = text.trim().match(/^(\d{10}|\d{13})$/)
	if (unix?.[1])
		return unix[1].length === 13 ? Number(unix[1]) : Number(unix[1]) * 1000

	const base = partsOf(now, zone)
	let { year, month, day } = base
	let hour: number | undefined
	let minute = 0
	let dayGiven = false
	let offset = 0
	let monthsAhead = 0
	let yearsAhead = 0
	let sign = 1
	let extraDays = 0
	/** The clock to use when none was typed, for "end of the day" and the like. */
	let fallbackClock: [number, number] | undefined
	/** Whether the day is one that was named, so a clock-less time is noon and not now. */
	let dayNamed = false

	// Words first: these have words in them that the steps below would take for something else.
	text = ` ${text
		.replace(/['’]/g, '')
		.replace(/\b(from now|hence|from today)\b/g, ' ')
		.replace(/\bthis time (next|last) (week|month|year)\b/g, ' $1 $2 ')
		.replace(/\beod\b/g, ' end of day ')
		.replace(/\beow\b/g, ' end of week ')
		.replace(/\beom\b/g, ' end of month ')
		.replace(/\beoy\b/g, ' end of year ')} `
	text = plainNumbers(text)

	// "end of the month", "start of next week", "beginning of the year".
	let m = take(
		/\b(end|start|beginning) of (?:the )?(this |next |last )?(day|week|month|year)\b/,
	)
	if (m) {
		const end = m[1] === 'end'
		const step = m[2] === 'next ' ? 1 : m[2] === 'last ' ? -1 : 0
		fallbackClock = end ? [23, 59] : [0, 0]
		dayGiven = true
		dayNamed = true
		if (m[3] === 'day') {
			extraDays += step
		} else if (m[3] === 'week') {
			// Weeks run Monday to Sunday.
			const toMonday = -((base.weekday + 6) % 7) + 7 * step
			extraDays += end ? toMonday + 6 : toMonday
		} else if (m[3] === 'month') {
			const target = new Date(Date.UTC(year, month + step, 1))
			year = target.getUTCFullYear()
			month = target.getUTCMonth()
			day = end ? daysIn(year, month) : 1
		} else {
			year += step
			month = end ? 11 : 0
			day = end ? 31 : 1
		}
	}

	// The weekend, and days people name.
	m = take(/\b(this |next )?weekend\b/)
	if (m) {
		extraDays +=
			(base.weekday === 0 ? 0 : 6 - base.weekday) + (m[1] === 'next ' ? 7 : 0)
		dayGiven = true
		dayNamed = true
	}
	for (const [pattern, holidayMonth, holidayDay, holidayHour] of HOLIDAYS) {
		if (dayGiven || !take(pattern)) continue
		const typedYear = take(/\b(20\d{2})\b/)
		month = holidayMonth
		day = holidayDay
		year = typedYear?.[1]
			? Number(typedYear[1])
			: month < base.month || (month === base.month && day < base.day)
				? base.year + 1
				: base.year
		if (holidayHour !== undefined) fallbackClock = [holidayHour, 0]
		dayGiven = true
		dayNamed = true
	}

	text = text.replace(/\b(at|on|the|of|from|after|around|about)\b/g, ' ')

	if (take(/\bnow\b/)) return now

	// "2 days ago" flips the direction of the offsets.
	if (take(/\bago\b/)) sign = -1
	take(/\bin\b/)

	// Dates first, so their numbers are not mistaken for offsets or clocks.
	m = take(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
	if (m) {
		year = Number(m[1])
		month = Number(m[2]) - 1
		day = Number(m[3])
		dayGiven = true
	}
	if (!dayGiven) {
		// Slashes (3/4, 3/4/2026) or dots with a year (3.4.2026): "1.5 years" is not a date.
		m = take(
			/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b|\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/,
		)
		if (m) {
			const a = Number(m[1] ?? m[4])
			const b = Number(m[2] ?? m[5])
			const typedYear = m[3] ?? m[6]
			const dayFirst = options.order === 'dmy' || a > 12 || m[4] !== undefined
			day = dayFirst ? a : b
			month = (dayFirst ? b : a) - 1
			if (typedYear)
				year =
					typedYear.length === 2 ? 2000 + Number(typedYear) : Number(typedYear)
			dayGiven = true
		}
	}
	if (!dayGiven) {
		const named = MONTH_KEYS.join('|')
		m = take(
			new RegExp(
				`\\b(${named})[a-z]*\\.? (\\d{1,2})(?:st|nd|rd|th)?(?: (\\d{4}))?\\b`,
			),
		)
		let isDay = false
		if (m) isDay = true
		else {
			m = take(
				new RegExp(
					`\\b(\\d{1,2})(?:st|nd|rd|th)? (${named})[a-z]*\\.?(?: (\\d{4}))?\\b`,
				),
			)
		}
		if (m) {
			const key = isDay ? m[1] : m[2]
			const number = isDay ? m[2] : m[1]
			month = MONTH_KEYS.indexOf(key ?? '')
			day = Number(number)
			if (m[3]) year = Number(m[3])
			dayGiven = true
		}
	}

	// "the 15th": that day of this month, or of next month if it has passed.
	if (!dayGiven) {
		m = take(/\b(\d{1,2})(?:st|nd|rd|th)\b/)
		if (m) {
			day = Number(m[1])
			if (day < base.day) monthsAhead += 1
			dayGiven = true
			dayNamed = true
		}
	}

	// Clocks.
	if (take(/\bnoon\b/)) hour = 12
	else if (take(/\bmidnight\b/)) hour = 0
	else {
		m = take(/\b(\d{1,2})(?::(\d{2}))?(?::\d{2})? ?([ap])\.?m\.?(?!\w)/)
		if (m) {
			const h = Number(m[1])
			if (h < 1 || h > 12) return undefined
			hour = (h % 12) + (m[3] === 'p' ? 12 : 0)
			minute = Number(m[2] ?? 0)
		} else {
			m = take(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/)
			if (m) {
				hour = Number(m[1])
				minute = Number(m[2])
			}
		}
	}

	// Offsets such as "+2h", "1d12h", "in 3 days 4 hours".
	for (;;) {
		const found = take(/([+-]?)\s*(\d+(?:\.\d+)?)\s*([a-z]+)\b/)
		if (!found) break
		const unit = unitOf(found[3] ?? '')
		if (!unit) return undefined
		const amount =
			Number(found[2]) * (found[1] === '-' ? -1 : 1) * sign * (unit.times ?? 1)
		if (unit.ms !== undefined) offset += amount * unit.ms
		else {
			// A part of a month or a year is counted in days.
			const whole = Math.trunc(amount)
			const days = (amount - whole) * (unit.unit === 'month' ? 30.4375 : 365.25)
			if (unit.unit === 'month') monthsAhead += whole
			else yearsAhead += whole
			offset += days * 86400000
		}
	}

	// Day words.
	let keepClock = true
	if (take(/\btonight\b/)) {
		if (hour === undefined) hour = 20
		dayGiven = true
	}
	if (take(/\btomorrow|tmrw|tmr\b/)) {
		extraDays += 1
		dayGiven = true
	} else if (take(/\byesterday\b/)) {
		extraDays -= 1
		dayGiven = true
	} else if (take(/\btoday\b/)) dayGiven = true
	if (take(/\bnext week\b/)) {
		extraDays += 7
		dayGiven = true
	} else if (take(/\bnext month\b/)) {
		monthsAhead += 1
		dayGiven = true
	} else if (take(/\bnext year\b/)) {
		yearsAhead += 1
		dayGiven = true
	} else if (take(/\blast month\b/)) {
		monthsAhead -= 1
		dayGiven = true
	} else if (take(/\blast year\b/)) {
		yearsAhead -= 1
		dayGiven = true
	} else if (take(/\blast week\b/)) {
		extraDays -= 7
		dayGiven = true
	} else {
		m = take(
			new RegExp(`\\b(next |this |last )?(${WEEKDAYS.join('|')})[a-z]*\\b`),
		)
		if (m) {
			const target = WEEKDAYS.indexOf(m[2] ?? '')
			const today = base.weekday
			let ahead = (target - today + 7) % 7
			if (m[1] === 'next ' && ahead === 0) ahead = 7
			if (m[1] === 'last ') ahead = ahead === 0 ? -7 : ahead - 7
			extraDays += ahead
			dayGiven = true
			keepClock = false
		}
	}

	// Anything left over that is a word means it was not understood.
	if (/[a-z0-9]/.test(text)) return undefined

	const explicitDate =
		month !== base.month || day !== base.day || year !== base.year
	let clockFromNow = false
	if (hour === undefined) {
		if (fallbackClock) [hour, minute] = fallbackClock
		else if (dayNamed || (dayGiven && !keepClock)) hour = 12
		else if (explicitDate && extraDays === 0) hour = 12
		else {
			hour = base.hour
			minute = base.minute
			clockFromNow = true
		}
	}
	if (
		month < 0 ||
		month > 11 ||
		day < 1 ||
		day > 31 ||
		year < 1970 ||
		year > 9999
	)
		return undefined

	let moment = momentOf(
		{ year, month, day: day + extraDays, hour, minute },
		zone,
	)
	if (monthsAhead || yearsAhead) {
		moment = shift(moment, zone, 'year', Math.trunc(yearsAhead))
		moment = shift(moment, zone, 'month', Math.trunc(monthsAhead))
	}
	if (clockFromNow) moment += base.second * 1000
	moment += offset
	if (
		options.rollForward &&
		!dayGiven &&
		!explicitDate &&
		offset === 0 &&
		!monthsAhead &&
		!yearsAhead &&
		moment < now
	)
		moment = shift(moment, zone, 'day', 1)
	return Number.isFinite(moment) ? Math.floor(moment / 1000) * 1000 : undefined
}

/** The quick picks, as words {@link readTime} understands. */
export const QUICK_PICKS: Array<{ label: string; when: string }> = [
	{ label: 'Now', when: 'now' },
	{ label: 'In 15 min', when: 'in 15 minutes' },
	{ label: 'In 30 min', when: 'in 30 minutes' },
	{ label: 'In 1 hour', when: 'in 1 hour' },
	{ label: 'In 2 hours', when: 'in 2 hours' },
	{ label: 'Tonight 8 PM', when: 'tonight' },
	{ label: 'Tomorrow 9 AM', when: 'tomorrow 9am' },
	{ label: 'Tomorrow noon', when: 'tomorrow noon' },
	{ label: 'Tomorrow 6 PM', when: 'tomorrow 6pm' },
	{ label: 'This weekend', when: 'this weekend' },
	{ label: 'Next Monday 9 AM', when: 'next monday 9am' },
	{ label: 'In a week', when: 'in 1 week' },
	{ label: 'In 2 weeks', when: 'in 2 weeks' },
	{ label: 'End of the month', when: 'end of the month' },
	{ label: 'Start of next month', when: 'start of next month' },
	{ label: 'In a month', when: 'in 1 month' },
	{ label: 'In 3 months', when: 'in 3 months' },
	{ label: 'In 6 months', when: 'in 6 months' },
	{ label: 'In a year', when: 'in 1 year' },
	{ label: 'Next year', when: 'next year' },
	{ label: 'End of the year', when: 'end of the year' },
	{ label: 'New Year', when: 'new years' },
	{ label: 'Halloween', when: 'halloween' },
	{ label: 'Christmas', when: 'christmas' },
]

/** One step of the Later and Earlier rows: how to move the chosen time. */
export interface Jump {
	label: string
	unit: 'year' | 'month' | 'day' | 'hour' | 'minute'
	amount: number
}

/** The steps for moving the chosen time later (and, negated, earlier). */
export const JUMPS: Jump[] = [
	{ label: '1 hour', unit: 'hour', amount: 1 },
	{ label: '6 hours', unit: 'hour', amount: 6 },
	{ label: '1 day', unit: 'day', amount: 1 },
	{ label: '3 days', unit: 'day', amount: 3 },
	{ label: '1 week', unit: 'day', amount: 7 },
	{ label: '2 weeks', unit: 'day', amount: 14 },
	{ label: '1 month', unit: 'month', amount: 1 },
	{ label: '3 months', unit: 'month', amount: 3 },
	{ label: '6 months', unit: 'month', amount: 6 },
	{ label: '1 year', unit: 'year', amount: 1 },
	{ label: '5 years', unit: 'year', amount: 5 },
	{ label: '10 years', unit: 'year', amount: 10 },
]
