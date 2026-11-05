/** The plugin's settings, stored as JSON. */
export interface PreviewSettings {
	/** Where the preview button is: a floating pill over the message box, or holding the send button. */
	buttonType: 'pill' | 'send'
	/** How the preview is shown: in a popup on top of the chat, or as a message only you can see. */
	previewType: 'popup' | 'ephemeral'
}

/** A message in the form Discord's code passes around. Only what the plugin reads or sets is listed. */
export interface PreviewMessage {
	[field: string]: unknown
	id?: string
	channel_id?: string
	content?: string
	attachments?: PreviewAttachment[]
	author?: unknown
}

/** A file picked for upload, written the way a sent message lists its attachments. */
export interface PreviewAttachment {
	id: string
	filename: string
	content_type: string
	size: number
	spoiler: boolean
	url: string
	proxy_url: string
	width?: number
	height?: number
}

/** The text field's props, as far as the plugin needs them: it listens to typing by wrapping `handleTextChanged`. */
export interface InputProps {
	handleTextChanged?: (text: string) => unknown
}

/** A drawn element that the plugin looks into, such as the children of the message box. */
export interface TreeNode {
	type?: unknown
	key?: unknown
	props?: Record<string, unknown> & { children?: unknown }
}

/** Discord's `MessageRecord` class, which builds a full message object from plain fields. */
export type MessageRecordClass = new (fields: Record<string, unknown>) => object

/** Discord's `RowManager` class, which the chat item needs to draw a message. */
export type RowManagerClass = new () => object

/** The component Discord draws one chat message with. */
export type ChatItemComponent = (props: {
	rowGenerator: object
	message: object
}) => import('react').ReactNode

/** The action creators the plugin uses to put a message into a channel. */
export interface MessageActions {
	receiveMessage(channelId: string, message: PreviewMessage): unknown
}

/** The action creators that build a message from Clyde, which look like a message only you can see. */
export interface BotMessages {
	createBotMessage(options: {
		channelId: string
		content: string
	}): PreviewMessage
}
