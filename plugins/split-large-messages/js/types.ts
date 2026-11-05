/**
 * Shapes of the Discord objects this plugin touches.
 *
 * Discord's own objects carry many more fields. Only the ones the plugin reads or forwards are listed, and the index
 * signatures let every other field pass through untouched.
 */

/** A message that is about to be sent. */
export interface OutgoingMessage {
	/** The text. Missing for messages that are only attachments or stickers. */
	content?: string
	/** Discord's client-side message id. It has to be unique for every message that is sent. */
	nonce?: string
	[field: string]: unknown
}

/** The extra options Discord passes with a send: the reply target, files to upload, and so on. */
export interface SendOptions {
	/** Files that are uploaded together with the message. */
	attachmentsToUpload?: unknown[]
	/** Called if uploading one of the files fails. */
	onAttachmentUploadError?: unknown
	[option: string]: unknown
}

/** The module that sends messages (found by its `sendMessage` and `receiveMessage` functions). */
export interface MessageActions {
	sendMessage(
		channelId: string,
		message: OutgoingMessage,
		clearDraft: boolean,
		options?: SendOptions,
	): Promise<unknown> | undefined
	receiveMessage: unknown
}

/** The part of Discord's `UserStore` that decides the message length limit. */
export interface UserStore {
	getCurrentUser?(): { premiumType?: number } | undefined
}
