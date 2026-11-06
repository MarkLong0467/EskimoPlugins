export type ActivityType = 0 | 1 | 2 | 3 | 5

export type ImageSource = 'none' | 'key' | 'url'

export interface ImageConfig {
	source: ImageSource
	/** Asset key (uploaded in Developer Portal) or an absolute image URL. */
	value: string
	/** Hover text shown next to the image in the activity. */
	text: string
	/** CDN id of the selected asset, used only to render local previews. */
	assetId?: string
}

export interface ButtonConfig {
	enabled: boolean
	label: string
	url: string
}

export interface CustomRpcStorage {
	enabled: boolean
	/** Discord Developer Portal application (client) ID. */
	clientId: string
	/** Header shown above details in the rich presence. */
	applicationName: string
	activityType: ActivityType
	details: string
	state: string
	/**
	 * Timestamps are not gated on the activity type — Listening carries them just
	 * like Playing — so this is a plain user preference rather than something the
	 * client forces per type.
	 */
	showTimestamp: boolean
	/**
	 * Epoch ms the elapsed counter is anchored to.
	 *
	 * Discord derives an activity's session key from `timestamps.start`, so this
	 * has to stay stable across updates: recomputing `Date.now()` on every publish
	 * changed the key, remounted the card and visibly restarted the counter.
	 */
	timestampStart: number
	/** Epoch ms the activity ends at, or `0` for no countdown. */
	timestampEnd: number
	largeImage: ImageConfig
	smallImage: ImageConfig
	buttons: ButtonConfig[]
}

export type Activity = {
	name: string
	application_id?: string
	flags: number
	type: number
	details?: string
	state?: string
	status_display_type?: number
	timestamps?: {
		start?: number | string
		end?: number | string
	}
	assets?: ActivityAssets
	/**
	 * Button *labels*. The URLs travel separately in `metadata.button_urls` — the
	 * client reads `activity.buttons[i]` as display text and pairs it with
	 * `button_urls[i]`, so sending objects here breaks the card.
	 */
	buttons?: string[]
	metadata?: {
		button_urls?: string[]
	}
}

export type ActivityAssets = {
	large_image?: string
	large_text?: string
	small_image?: string
	small_text?: string
}

export type RevengeJsonStorageApi<S extends object> = {
	cache?: S
	use(): S | undefined
	set(patch: Partial<S>): Promise<void>
	subscribe(callback: (update: Partial<S>) => void): () => void
}
