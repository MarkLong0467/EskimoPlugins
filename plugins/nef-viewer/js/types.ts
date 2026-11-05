/**
 * Shapes of the Discord objects this plugin reads and rewrites.
 *
 * Discord's messages and attachments carry many more fields. Only the ones the plugin uses are listed, and the index
 * signatures let every other field pass through untouched.
 */

/** A file attached to a message. */
export interface Attachment {
	id: string
	filename: string
	url: string
	proxy_url?: string
	content_type?: string
	width?: number
	height?: number
	size?: number
	[field: string]: unknown
}

/** A message, as it arrives in Flux events and as it is kept in the message store. */
export interface DiscordMessage {
	id?: string
	channel_id?: string
	attachments?: Attachment[]
	/** Forwarded messages: the original message is inside a snapshot. */
	message_snapshots?: Array<{ message?: DiscordMessage } | undefined>
}

/** The part of Discord's `MessageStore` this plugin uses. */
export interface MessageStore {
	getMessage?(channelId: string, messageId: string): DiscordMessage | undefined
}
