import { Stores } from '@valenced/discord/flux'
import { DAYS, MONTHS } from './constants'

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

/** A time typed as a Unix time (seconds or milliseconds) or as a date, in milliseconds. Nothing if it is neither. */
export function parseTime(value: unknown): number | undefined {
	const s = String(value == null ? '' : value).trim()
	if (!s) return undefined
	if (/^\d+$/.test(s)) {
		const n = Number(s)
		return n < 1e12 ? n * 1000 : n
	}
	const t = Date.parse(s)
	return Number.isNaN(t) ? undefined : t
}

/** A whole number typed as text. Nothing if it is not one, or is negative. */
export function num(value: unknown): number | undefined {
	const n = Number.parseInt(String(value == null ? '' : value).trim(), 10)
	return Number.isNaN(n) || n < 0 ? undefined : n
}

/** A text with its variables filled in, or nothing if it comes out empty. */
export function text(value: unknown, appliedAt?: number): string | undefined {
	const s = fill(value, appliedAt)
	return typeof s === 'string' && s.trim() ? s : undefined
}
