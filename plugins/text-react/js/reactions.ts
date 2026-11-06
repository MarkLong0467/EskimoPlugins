import { delayMs } from './config'
import { apiPut, errorText, toast } from './discord'
import type { ApiError, Target } from './types'

/** The selector that asks for the colored picture of a symbol. */
const PRESENTATION = String.fromCharCode(0xfe0f)

/** The job that is adding reactions now, if any. Starting a new one or stopping the plugin cancels it. */
let job: { cancelled: boolean } | undefined

/** Waits for a number of milliseconds. */
const sleep = (ms: number) =>
	new Promise<void>(resolve => setTimeout(resolve, ms))

/** Cancels the reactions that are being added. Used when the plugin stops. */
export function cancelReactions(): void {
	if (job) job.cancelled = true
	job = undefined
}

/** Puts the reaction on the message, as the account, with the emoji written into the path. */
function putReaction(target: Target, emoji: string): Promise<void> {
	return apiPut(
		`/channels/${target.channelId}/messages/${target.messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
	)
}

/**
 * Adds one reaction to a message.
 *
 * - If Discord says to slow down (429) it waits as long as it asks and tries once more.
 * - If Discord does not know the emoji (400) it tries once more with the emoji presentation selector added: symbols such
 *   as the copyright sign and the information sign are written with it in Discord's own list.
 */
async function addReaction(target: Target, emoji: string): Promise<void> {
	try {
		await putReaction(target, emoji)
	} catch (error) {
		const e = error as ApiError
		if (e.status === 429) {
			const wait = Number(e.body?.retry_after)
			await sleep(
				Math.min(10000, (Number.isFinite(wait) ? wait : 1) * 1000 + 100),
			)
			await putReaction(target, emoji)
		} else if (e.status === 400 && !emoji.endsWith(PRESENTATION)) {
			await putReaction(target, emoji + PRESENTATION)
		} else throw error
	}
}

/**
 * Adds the emoji to a message one at a time, with a pause between them (the Discord limit on reactions is strict).
 *
 * It stops at the first reaction Discord refuses (for example when the account cannot react in that channel), and says so.
 * It also stops if it is cancelled.
 *
 * @param target The message.
 * @param emoji The emoji, in order.
 * @returns Whether every reaction was added.
 */
export async function addReactions(
	target: Target,
	emoji: string[],
): Promise<boolean> {
	cancelReactions()
	const mine = { cancelled: false }
	job = mine
	for (const [index, one] of emoji.entries()) {
		if (mine.cancelled) return false
		try {
			await addReaction(target, one)
		} catch (error) {
			const e = error as ApiError
			toast(
				e.status === 403
					? "You can't add reactions in this channel"
					: `Could not add a reaction: ${errorText(error).slice(0, 80)}`,
			)
			if (job === mine) job = undefined
			return false
		}
		if (index < emoji.length - 1) await sleep(delayMs())
	}
	if (job === mine) job = undefined
	toast(`Added ${emoji.length} reaction${emoji.length === 1 ? '' : 's'}`)
	return true
}
