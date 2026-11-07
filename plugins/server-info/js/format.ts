import { DISCORD_EPOCH, SNOWFLAKE_TIME_DIVISOR } from './constants'

/**
 * The time part of a snowflake id: how many milliseconds after the Discord epoch it was made.
 * Dividing by 2^22 is exact enough here, and avoids BigInt.
 */
export function snowflake(id: string): number {
	return Math.floor(Number(id) / SNOWFLAKE_TIME_DIVISOR)
}

/** The day an id was made, as a short date in the user's language, for example `Mar 5, 2021`. */
export function createdOn(id: string): string {
	return new Date(snowflake(id) + DISCORD_EPOCH).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	})
}

/** Hashes that start with `a_` are animated, and are gifs. */
const extension = (hash: string) =>
	String(hash).indexOf('a_') === 0 ? 'gif' : 'png'

/** The link to a user's avatar, or to one of Discord's six default avatars if they have none. */
export function avatarUrl(
	userId: string,
	hash: string | null | undefined,
): string {
	if (!hash)
		return `https://cdn.discordapp.com/embed/avatars/${snowflake(userId) % 6}.png`
	return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${extension(hash)}?size=64`
}

/** The link to a server's icon or banner (`kind` is `icons` or `banners`) at the given width in pixels. */
export function assetUrl(
	kind: 'icons' | 'banners',
	id: string,
	hash: string,
	size: number,
): string {
	return `https://cdn.discordapp.com/${kind}/${id}/${hash}.${extension(hash)}?size=${size}`
}

/** A number with separators in the user's language (`12,345`). Anything else is returned as it is. */
export function formatNumber<T>(value: T): T | string {
	return typeof value === 'number' ? value.toLocaleString() : value
}

/** A date written out in the user's language, for example `March 1, 2026`. */
export function longDate(ms: number): string {
	return new Date(ms).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	})
}

const DAY = 86_400_000

/** How long ago a moment was, in words: `today`, `3 days ago`, `8 months ago`, `2 years ago`. */
export function ago(ms: number, now = Date.now()): string {
	const days = Math.floor((now - ms) / DAY)
	if (days < 1) return 'today'
	if (days === 1) return 'yesterday'
	if (days < 30) return `${days} days ago`
	const months = Math.floor(days / 30.4375)
	if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
	const years = Math.floor(days / 365.25)
	return `${years} year${years === 1 ? '' : 's'} ago`
}

/** The names of the verification levels, from 0 up. */
export const VERIFICATION = ['None', 'Low', 'Medium', 'High', 'Highest']

/** The language names for the codes servers use. A code that is not here is shown as it is. */
const LANGUAGES: Record<string, string> = {
	'en-US': 'English',
	'en-GB': 'English (UK)',
	'es-ES': 'Spanish',
	'es-419': 'Spanish (Latin America)',
	fr: 'French',
	de: 'German',
	it: 'Italian',
	'pt-BR': 'Portuguese (Brazil)',
	nl: 'Dutch',
	pl: 'Polish',
	ru: 'Russian',
	uk: 'Ukrainian',
	tr: 'Turkish',
	ja: 'Japanese',
	ko: 'Korean',
	'zh-CN': 'Chinese (China)',
	'zh-TW': 'Chinese (Taiwan)',
	ar: 'Arabic',
	hi: 'Hindi',
	id: 'Indonesian',
	vi: 'Vietnamese',
	th: 'Thai',
	sv: 'Swedish',
	'sv-SE': 'Swedish',
	da: 'Danish',
	no: 'Norwegian',
	fi: 'Finnish',
	cs: 'Czech',
	el: 'Greek',
	hu: 'Hungarian',
	ro: 'Romanian',
	bg: 'Bulgarian',
	hr: 'Croatian',
	lt: 'Lithuanian',
}

/** The name of a server's language, for example `English` for `en-US`. */
export function languageName(code: string | null | undefined): string {
	if (!code) return 'English'
	return LANGUAGES[code] ?? LANGUAGES[code.split('-')[0] ?? ''] ?? code
}

/** The boosts a server needs for levels 1, 2 and 3. */
export const BOOSTS_FOR_LEVEL = [0, 2, 7, 14]

/** What the boost card says. */
export interface BoostCard {
	title: string
	count: string
	/** From 0 to 1: how far to the next level. */
	fraction: number
	/** For example `2 more boosts for Level 1`, or nothing at the top level. */
	hint: string
}

/** Works out the boost card from the server's level and boost count. */
export function boostCard(tier: number, boosts: number): BoostCard {
	const level = Math.min(3, Math.max(0, Math.floor(tier)))
	const count = `${boosts} boost${boosts === 1 ? '' : 's'}`
	const title = level === 0 ? 'No boost level yet' : `Level ${level}`
	if (level >= 3)
		return { title, count, fraction: 1, hint: 'This server has the top level' }
	const need = BOOSTS_FOR_LEVEL[level + 1] as number
	const more = Math.max(0, need - boosts)
	return {
		title,
		count,
		fraction: Math.min(1, Math.max(0, boosts / need)),
		hint: `${more} more boost${more === 1 ? '' : 's'} for Level ${level + 1}`,
	}
}
