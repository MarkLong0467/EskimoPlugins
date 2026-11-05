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
