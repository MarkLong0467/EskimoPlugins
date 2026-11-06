/** The plugin's settings, stored as JSON. See `DEFAULT_SETTINGS` in `constants.ts` for what each one does. */
export interface TextReactSettings {
	/** Add "Text React" to the menu you get when you hold a message. */
	menu: boolean
	/** Ask before reacting when part of the text has no emoji. */
	warn: boolean
	/** Slide the sheet in. Off: it pops up at once, which is lighter on slow phones. */
	animate: boolean
	/** How many seconds to wait between two reactions, as text. */
	delaySeconds: string
}

/** What turning a text into emoji gave. */
export interface EmojiResult {
	/** The emoji to react with, in order. Each is used once. */
	emoji: string[]
	/** True if some of the text could not be turned into an emoji. */
	incomplete: boolean
}

/** The message a menu was opened for, and when that was noticed. */
export interface Target {
	channelId: string
	messageId: string
	at: number
}

/** One item of a menu that is a list of items. Discord adds more fields than are listed. */
export interface MenuItem {
	label?: string
	iconSource?: unknown
	IconComponent?: unknown
	[field: string]: unknown
}

/** Discord's connection to its web API, as far as the plugin uses it. */
export interface Http {
	put?(options: { url: string }): Promise<unknown>
}

/** A failed answer from Discord's web API. */
export interface ApiError extends Error {
	status?: number
	body?: { message?: unknown; retry_after?: unknown }
}
