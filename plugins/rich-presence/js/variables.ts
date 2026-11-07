import { Stores } from '@valenced/discord/flux'
import { DAYS, MONTHS } from './constants'
import { parseDate } from './timers'

/** Variables other plugins provide, for example `{sc_title}` from SoundCloud Presence. */
type SharedVars = Record<string, unknown> | undefined

/** A number with a leading zero if it is below 10. */
export const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`)

/** How long the presence has been applied: `5:07` or `1:05:07`. */
function uptime(appliedAt: number): string {
	const s = Math.max(0, Math.floor((Date.now() - appliedAt) / 1000))
	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/**
 * Replaces `{time}`, `{date}` and friends in a text. Unknown names are left as typed.
 *
 * The names are time, time12, seconds, date, day, month, year, user, username and uptime, and anything another plugin
 * puts in `globalThis.eskimoVars`. With SoundCloud Presence off or missing, `{sc_title}` and the other `sc_` names come
 * out empty rather than as typed, so "show only when" can hide the presence.
 */
export function fill(text: unknown, appliedAt = Date.now()): unknown {
	if (typeof text !== 'string' || text.indexOf('{') < 0) return text
	const now = new Date()
	const user = (
		Stores as unknown as {
			UserStore?: {
				getCurrentUser?: () =>
					| { globalName?: string; username?: string }
					| undefined
			}
		}
	).UserStore?.getCurrentUser?.()
	const h12 = now.getHours() % 12 || 12
	const vars: Record<string, string> = {
		time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
		time12: `${h12}:${pad(now.getMinutes())}${now.getHours() < 12 ? ' AM' : ' PM'}`,
		seconds: pad(now.getSeconds()),
		date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
		day: DAYS[now.getDay()],
		month: MONTHS[now.getMonth()],
		year: `${now.getFullYear()}`,
		user: user ? user.globalName || user.username || '' : '',
		username: user ? user.username || '' : '',
		uptime: uptime(appliedAt),
	}
	return text.replace(/\{(\w+)\}/g, (all, name: string) => {
		// Object.hasOwn is newer than the oldest phones' JavaScript, so the long form is used.
		// biome-ignore lint/suspicious/noPrototypeBuiltins: see above
		if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name]
		const shared = (globalThis as unknown as { eskimoVars?: SharedVars })
			.eskimoVars
		// biome-ignore lint/suspicious/noPrototypeBuiltins: see above
		if (shared && Object.prototype.hasOwnProperty.call(shared, name))
			return shared[name] == null ? '' : String(shared[name])
		return /^sc_(title|artist|url|art|button)$/.test(name) ? '' : all
	})
}

/** A date typed by a person, in milliseconds. Nothing if it is not a date. See `parseDate` in `timers.ts`. */
export const parseTime = parseDate

/** A whole number typed as text. Nothing if it is not one, or is negative. */
export function num(value: unknown): number | undefined {
	const n = Number.parseInt(String(value == null ? '' : value).trim(), 10)
	return Number.isNaN(n) || n < 0 ? undefined : n
}

/** The biggest group size Discord takes: the largest 32-bit whole number, which is also what Kizzy allows. */
export const PARTY_MAX_SIZE = 2147483647

/**
 * A group size typed as text: digits only, a whole number from 1 up to {@link PARTY_MAX_SIZE}. Nothing if it is not one.
 * Spaces around it are ignored; anything else in it (a minus, a dot, letters) makes it invalid.
 */
export function partySize(value: unknown): number | undefined {
	const raw = String(value == null ? '' : value).trim()
	if (!/^\d{1,10}$/.test(raw)) return undefined
	const n = Number(raw)
	return n >= 1 && n <= PARTY_MAX_SIZE ? n : undefined
}

/**
 * What is wrong with a group size field, in plain words, or nothing if it is fine or empty. These are the checks Kizzy makes:
 * it has to be a whole number above 0, and the number in the group cannot be bigger than the group size.
 *
 * @param field Which of the two boxes this is about.
 * @param current What is typed in the "In the group now" box.
 * @param max What is typed in the "Group size" box.
 */
export function partyProblem(
	field: 'current' | 'max',
	current: unknown,
	max: unknown,
): string | undefined {
	const own = String((field === 'current' ? current : max) ?? '').trim()
	if (!own) {
		return field === 'max' && String(current ?? '').trim()
			? 'Needed: the group size cannot be empty when the number in the group is filled in.'
			: undefined
	}
	if (!/^\d+$/.test(own)) return 'Not a number. Use digits only, such as 4.'
	const n = Number(own)
	if (n < 1) return 'Must be more than 0.'
	if (n > PARTY_MAX_SIZE) return `Too big. The most is ${PARTY_MAX_SIZE}.`
	const a = partySize(current)
	const b = partySize(max)
	if (a !== undefined && b !== undefined && a > b)
		return field === 'current'
			? 'Cannot be more than the group size.'
			: 'Cannot be less than the number in the group.'
	return undefined
}

/** A text with its variables filled in, or nothing if it comes out empty. */
export function text(value: unknown, appliedAt?: number): string | undefined {
	const s = fill(value, appliedAt)
	return typeof s === 'string' && s.trim() ? s : undefined
}
