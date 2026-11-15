/** A webhook you saved: its address and what Discord said about it when it was checked. */
export interface Webhook {
	/** The id of the saved entry (the webhook's own id). */
	id: string
	token: string
	/** What you call it here. Starts as the webhook's name. */
	label: string
	/** The webhook's own name and avatar, as Discord last said. */
	name: string
	avatar: string | null
	channelId: string | null
	guildId: string | null
	/** When it was added (milliseconds). */
	addedAt: number
}

/** One field of an embed. */
export interface EmbedField {
	name: string
	value: string
	inline: boolean
}

/** How the time at the bottom of an embed is chosen. */
export type TimestampMode = 'none' | 'sent' | 'fixed'

/** An embed as the editor holds it. Empty text means "not set". */
export interface Embed {
	/** A key for the editor's list, never sent. */
	key: string
	title: string
	url: string
	description: string
	/** A colour as `#rrggbb`, or empty for none. */
	color: string
	authorName: string
	authorUrl: string
	authorIcon: string
	footerText: string
	footerIcon: string
	image: string
	/** Up to three more pictures, shown with `image` as a gallery (they need a link). */
	gallery: string[]
	thumbnail: string
	timestampMode: TimestampMode
	/** For `fixed`: the time in milliseconds. */
	timestamp: number
	fields: EmbedField[]
}

/** A link button. Webhooks that no bot owns can send only link buttons. */
export interface LinkButton {
	label: string
	url: string
	emoji: string
}

/** A poll. */
export interface Poll {
	question: string
	answers: string[]
	/** How long it is open, in hours (1 to 768). */
	hours: number
	multiselect: boolean
}

/** Who a message may ping. */
export type MentionMode = 'all' | 'users' | 'none'

/** A message as the editor holds it. */
export interface Draft {
	content: string
	username: string
	avatarUrl: string
	embeds: Embed[]
	/** Rows of link buttons. */
	buttons: LinkButton[][]
	poll: Poll | null
	/** Send into this thread (id), or empty. */
	threadId: string
	/** In a forum channel: make a new post with this title. */
	threadName: string
	/** Send without a notification (`@silent`). */
	silent: boolean
	/** Hide the previews of links. */
	suppressEmbeds: boolean
	tts: boolean
	mentions: MentionMode
}

/** A message that was sent, so it can be edited or deleted later. */
export interface Sent {
	id: string
	webhookId: string
	messageId: string
	channelId: string | null
	guildId: string | null
	threadId: string | null
	/** A short text to recognise it by. */
	preview: string
	at: number
}

/** A message you saved to use again. */
export interface Saved {
	id: string
	name: string
	draft: Draft
	savedAt: number
}

/** How often a scheduled message is sent again. */
export type Repeat = 'none' | 'hourly' | 'daily' | 'weekly'

/** A message to send later. */
export interface Scheduled {
	id: string
	at: number
	repeat: Repeat
	webhookIds: string[]
	draft: Draft
	/** What went wrong the last time, if anything. */
	lastError: string
}

/** The plugin's options. */
export interface Options {
	/** "Webhook Builder" in the menu of a held message. */
	menu: boolean
	/** Ask before a message is sent. */
	confirmSend: boolean
	/** Send scheduled messages that came due while Discord was closed. */
	sendLate: boolean
	/** Keep links in the log of sent messages. */
	keepHistory: boolean
}

/** Where the editor sends to, and whether it edits a message that was sent. */
export interface Target {
	webhookIds: string[]
	/** A sent message being edited, or empty. */
	editing: string
}

/** Everything the plugin saves. */
export interface State {
	webhooks: Webhook[]
	saved: Saved[]
	sent: Sent[]
	scheduled: Scheduled[]
	draft: Draft
	target: Target
	options: Options
}

/** A webhook as Discord's API gives it, as far as this plugin uses it. */
export interface ApiWebhook {
	id: string
	type?: number
	token?: string
	name?: string | null
	avatar?: string | null
	channel_id?: string | null
	guild_id?: string | null
}

/** A message as Discord's API gives it, as far as this plugin uses it. */
export interface ApiMessage {
	id: string
	channel_id?: string
	content?: string
	webhook_id?: string
	author?: { id?: string; username?: string; avatar?: string | null }
	embeds?: ApiEmbed[]
	components?: ApiComponent[]
	poll?: {
		question?: { text?: string }
		answers?: { poll_media?: { text?: string } }[]
		allow_multiselect?: boolean
		expiry?: string
	}
	flags?: number
	position?: number
}

/** An embed as Discord's API gives it (also accepted in the shape Discord's app keeps it in). */
export interface ApiEmbed {
	type?: string
	title?: string
	url?: string
	description?: string
	color?: number | string
	timestamp?: string
	author?: { name?: string; url?: string; icon_url?: string; iconURL?: string }
	footer?: { text?: string; icon_url?: string; iconURL?: string }
	image?: { url?: string }
	thumbnail?: { url?: string }
	fields?: {
		name?: string
		value?: string
		inline?: boolean
		rawName?: string
		rawValue?: string
	}[]
	rawTitle?: string
	rawDescription?: string
}

/** A component as Discord's API gives it. */
export interface ApiComponent {
	type: number
	style?: number
	label?: string
	url?: string
	emoji?: { name?: string; id?: string } | null
	components?: ApiComponent[]
}

/** What one send did. */
export interface SendResult {
	webhook: Webhook
	ok: boolean
	message?: ApiMessage
	error?: string
}
