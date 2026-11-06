import { MAX_REACTIONS } from './constants'
import { store } from './discord'
import type { Target } from './types'

/** The part of Discord's message store this uses. */
interface Messages {
	getMessage?(
		channelId: string,
		messageId: string,
	):
		| {
				reactions?: Array<{
					emoji?: { id?: string | null; name?: string | null }
				}>
		  }
		| undefined
}

/** How full a message is with reactions. */
export interface Capacity {
	/** How many different reactions the message has. */
	used: number
	/** How many more different reactions fit. */
	left: number
	/** The ordinary emoji already on the message. Reacting with one of them adds no new reaction. */
	present: Set<string>
}

/**
 * Looks at the reactions a message has now.
 *
 * A message holds at most `MAX_REACTIONS` different reactions. Custom emoji count too, but cannot be told from the plain emoji
 * this plugin adds, so only the plain ones are kept in `present`.
 *
 * @returns Nothing if the message is not in Discord's store.
 */
export function reactionCapacity(target: Target): Capacity | null {
	const message = store<Messages>('MessageStore')?.getMessage?.(
		target.channelId,
		target.messageId,
	)
	if (!message) return null
	const reactions = Array.isArray(message.reactions) ? message.reactions : []
	const present = new Set<string>()
	for (const reaction of reactions) {
		const emoji = reaction?.emoji
		if (emoji && !emoji.id && emoji.name) present.add(emoji.name)
	}
	return {
		used: reactions.length,
		left: Math.max(0, MAX_REACTIONS - reactions.length),
		present,
	}
}

/** How many of these emoji would be new reactions on the message. */
export function newReactions(emoji: string[], capacity: Capacity): number {
	return emoji.filter(item => !capacity.present.has(item)).length
}
