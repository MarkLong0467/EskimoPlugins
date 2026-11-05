import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import type { DiscordMessage, MessageStore, UserStore } from './types'

// `Stores` is typed loosely (every store is `Store<object>`), so the few methods used here are described locally.
const users = () => Stores.UserStore as unknown as UserStore | undefined
const messages = () =>
	Stores.MessageStore as unknown as MessageStore | undefined

/** Whether Discord already has this user. Unknown users are the ones drawn as `@unknown-user`. */
export function isKnownUser(id: string): boolean {
	return !!users()?.getUser?.(id)
}

/** Looks a message up in the message store, or returns nothing if Discord no longer has it. */
export function getStoredMessage(
	channelId: string,
	messageId: string,
): DiscordMessage | undefined {
	return messages()?.getMessage?.(channelId, messageId)
}

/**
 * Tells Discord the message changed, so it draws it again. The mention is resolved at draw time, so once the user is
 * known the same text now shows the name.
 */
export function redrawMessage(
	message: DiscordMessage,
	fallbackChannelId: string,
): void {
	Dispatcher.dispatch({
		type: 'MESSAGE_UPDATE',
		message: {
			id: message.id,
			channel_id: message.channel_id ?? fallbackChannelId,
			content: message.content,
			embeds: message.embeds,
		},
	} as never)
}
