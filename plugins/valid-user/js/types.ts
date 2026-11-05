/**
 * Shapes of the Discord objects this plugin reads.
 *
 * Discord's messages carry many more fields. Only the ones the plugin looks at are listed, and values that may be
 * missing or have another type are `unknown`, so the code has to check them before use.
 */

/** The module with Discord's user actions (found by `getUser` and `fetchCurrentUser`). */
export interface UserActions {
	/** Fetches a user from Discord's API and puts it in the user store. */
	getUser(id: string): Promise<unknown>
	fetchCurrentUser: unknown
}

/** One field of an embed. The `raw` variants are the text before Discord parsed it. */
export interface EmbedField {
	name?: unknown
	value?: unknown
	rawName?: unknown
	rawValue?: unknown
}

/** An embed under a message. */
export interface Embed {
	title?: unknown
	description?: unknown
	rawTitle?: unknown
	rawDescription?: unknown
	author?: { name?: unknown }
	footer?: { text?: unknown }
	fields?: EmbedField[]
}

/** A message, as it arrives in Flux events and as it is kept in the message store. */
export interface DiscordMessage {
	id?: string
	channel_id?: string
	content?: unknown
	embeds?: Embed[]
	/** Forwarded messages: the original message is inside a snapshot. */
	message_snapshots?: Array<{ message?: DiscordMessage } | undefined>
}

/** The part of Discord's `UserStore` this plugin uses. */
export interface UserStore {
	getUser?(id: string): unknown
}

/** The part of Discord's `MessageStore` this plugin uses. */
export interface MessageStore {
	getMessage?(channelId: string, messageId: string): DiscordMessage | undefined
}
