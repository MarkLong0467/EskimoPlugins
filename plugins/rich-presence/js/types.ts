/** How the timer on the presence works. */
export type TimestampMode =
	| 'none'
	| 'elapsed'
	| 'clock'
	| 'countdown'
	| 'custom'
	| 'external'

/**
 * One profile: everything that makes a presence. Text fields may contain variables such as `{time}`, and are saved as
 * typed (as text), so a number like the party size is text too.
 */
export interface Profile {
	id: string
	/** The name shown in the list of profiles. */
	label: string
	/** The activity name: required, nothing is shown without it. */
	name: string
	/** The kind of activity: 0 playing, 1 streaming, 2 listening, 3 watching, 5 competing. */
	type: number
	details: string
	detailsUrl: string
	state: string
	stateUrl: string
	/** The id of a Discord application. Needed for asset keys. */
	applicationId: string
	/** A Twitch or YouTube link, for streaming. */
	streamUrl: string
	largeImage: string
	largeUrl: string
	largeText: string
	smallImage: string
	smallUrl: string
	smallText: string
	timestampMode: TimestampMode
	customStart: string
	customEnd: string
	countdownMinutes: string
	partyCurrent: string
	partyMax: string
	button1Label: string
	button1Url: string
	button2Label: string
	button2Url: string
	/** Hides the presence while this text comes out empty. */
	showOnlyWhen: string
}

/** The plugin's settings, stored as JSON. */
export interface RichPresenceSettings {
	/** The main switch. */
	enabled: boolean
	/** Send the presence when Discord starts. */
	applyOnStart: boolean
	/** How often the presence is sent again, in seconds, as text. `0` is never; the shortest is 15. */
	refreshSeconds: string
	/** The id of the profile in use. */
	activeProfile: string
	profiles: Profile[]
}

/** The activity in the form Discord's `LOCAL_ACTIVITY_UPDATE` expects. */
export interface Activity {
	application_id: string
	name: string
	type: number
	flags: number
	details?: string
	state?: string
	details_url?: string
	state_url?: string
	url?: string
	timestamps?: { start?: number; end?: number }
	party?: { size: [number, number] }
	assets?: Record<string, string>
	buttons?: string[]
	metadata?: { button_urls: string[] }
}

/** What the live preview shows, worked out from a profile. */
export interface PreviewInfo {
	name: string | undefined
	title: string | undefined
	details: string | undefined
	state: string | undefined
	timer: string | undefined
	buttons: string[]
	image: string | undefined
	hasImage: boolean
	smallImage: string | undefined
}

/** One choice in a list of radio rows. */
export interface Choice<V = string | number> {
	v: V
	l: string
}

/** Discord's code for hosting and looking up presence images. */
export interface AssetUtils {
	fetchAssetIds?(applicationId: string, keys: string[]): Promise<string[]>
	getAssetIds?(applicationId: string, keys: string[]): string[] | undefined
}

/** Discord's connection to its web API. */
export interface Http {
	post?(options: {
		url: string
		body: unknown
	}): Promise<{ body?: unknown } | undefined>
}
