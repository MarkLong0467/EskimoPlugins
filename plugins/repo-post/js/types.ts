/** One plugin of the list, as `post.json` has it. */
export interface PostPlugin {
	id: string
	name: string
	/** The version of the `latest` channel. */
	version: string
	/** The short line that says what it does. */
	short: string
	/** Text after the name, such as `(beta)`. */
	suffix: string
}

/** The contents of `post.json`, made by `tools/post.cjs` when a plugin is published. */
export interface PostData {
	format: number
	/** The lines above the list. */
	header: string[]
	/** The lines below the list. */
	footer: string[]
	plugins: PostPlugin[]
}

/** How many characters the post may have: Discord's own limit, or one of the two sizes. */
export type LimitChoice = 'auto' | '2000' | '4000'

/** What the plugin saves. */
export interface PostSettings {
	/** Keep the post up to date on its own. */
	auto: boolean
	/** Where `post.json` is. */
	postUrl: string
	/** The thread (a forum post is a channel of its own). */
	channelId: string
	/** The message to edit. The first message of a forum post has the same id as the thread. */
	messageId: string
	/** Show the version number after each name. */
	versions: boolean
	limit: LimitChoice
	/** A fingerprint of the text the post was last made to match. */
	syncedHash: string
	/** When the post was last made to match (milliseconds). */
	syncedAt: number
	/** What the post said before the last change, so it can be put back. */
	previousText: string
}

/** What came of making a text fit. */
export interface Rendered {
	text: string
	/** Whether it fits the limit. */
	fits: boolean
	/** How the descriptions had to be shortened to fit. */
	level: 'full' | 'shortened' | 'names only' | 'too long'
	/** The longest a description was allowed to be, or 0 when none were shown. */
	maxDescription: number
	limit: number
}

/** What a sync did. */
export interface SyncResult {
	status: 'updated' | 'same' | 'preview' | 'error'
	/** A sentence for the screen and the log. */
	detail: string
	at: number
}

/** Discord's own server connection, as far as this plugin uses it. */
export interface DiscordHttp {
	get?(request: { url: string }): PromiseLike<{ body?: unknown }>
	patch?(request: { url: string; body: object }): PromiseLike<unknown>
}

/** A message as Discord's API gives it, as far as this plugin uses it. */
export interface ApiMessage {
	id: string
	content?: string
	author?: { id?: string }
}
