/** What a server has, counted from Discord's channel store. */
export interface ChannelCounts {
	total: number
	/** The channels you can read in, which is text, announcement, forum and media channels. */
	text?: number
	/** Voice and stage channels. */
	voice?: number
	categories?: number
	announcements?: number
	forums?: number
	stages?: number
}

/** The kind of a channel, as Discord numbers them. */
const ANNOUNCEMENT = 5
const STAGE = 13
const FORUM = 15
const MEDIA = 16

/** How many of a list of `{ channel }` entries are of the given kinds. */
function kindCount(list: unknown, kinds: number[]): number {
	if (!Array.isArray(list)) return 0
	let count = 0
	for (const entry of list) {
		const type = (entry as { channel?: { type?: unknown } } | null)?.channel
			?.type
		if (typeof type === 'number' && kinds.includes(type)) count++
	}
	return count
}

/**
 * Counts the channels of a server. Discord's channel store sorts them into `SELECTABLE` (text) and `VOCAL` (voice) lists,
 * and keeps the categories under their own number (4). A store that has no such lists is counted by its entries.
 */
export function countChannels(
	all: Record<string, unknown> | undefined,
): ChannelCounts | null {
	if (!all) return null
	const text = Array.isArray(all.SELECTABLE) ? all.SELECTABLE.length : undefined
	const voice = Array.isArray(all.VOCAL) ? all.VOCAL.length : undefined
	if (text === undefined && voice === undefined)
		return { total: Object.keys(all).length }
	const categories = Array.isArray(all[4]) ? (all[4] as unknown[]).length : 0
	return {
		total: (text ?? 0) + (voice ?? 0),
		text: text ?? 0,
		voice: voice ?? 0,
		categories,
		announcements: kindCount(all.SELECTABLE, [ANNOUNCEMENT]),
		forums: kindCount(all.SELECTABLE, [FORUM, MEDIA]),
		stages: kindCount(all.VOCAL, [STAGE]),
	}
}
