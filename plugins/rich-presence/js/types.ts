/**
 * How the timer on a presence works.
 *
 * - `none`: no timer.
 * - `elapsed`: counts up from when the presence was switched on or applied.
 * - `app`: counts up from when Discord was opened.
 * - `clock`: counts up from midnight, so it reads like the time of day.
 * - `since`: counts up from a date.
 * - `until`: counts down to a date, which can repeat (every day, week, month or year).
 * - `countdown`: counts down a number of minutes, which can start again each time it runs out.
 * - `midnight`: counts down to the end of today.
 * - `daily`: a progress bar between two times of day, every day.
 * - `custom`: a start and an end (the timer starts again when both are set).
 * - `external`: the start and end of the SoundCloud track.
 */
export type TimestampMode =
	| 'none'
	| 'elapsed'
	| 'app'
	| 'clock'
	| 'since'
	| 'until'
	| 'countdown'
	| 'midnight'
	| 'daily'
	| 'custom'
	| 'external'

/** How often a date repeats once it has passed. */
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

/** What a profile is: one you write yourself, or the SoundCloud track you are listening to. */
export type ProfileKind = 'custom' | 'soundcloud'

/**
 * One profile: everything that makes a presence. Text fields may contain variables such as `{time}`, and are saved as
 * typed (as text), so a number like the party size is text too.
 */
export interface Profile {
	id: string
	/** What it is. A SoundCloud profile has no fields of its own: its settings are the plugin's SoundCloud settings. */
	kind: ProfileKind
	/** The name shown in the list of profiles. */
	label: string
	/** Whether this profile is one of the presences that are shown. Several can be on at once, up to the plugin's limit. */
	enabled: boolean
	/** The activity name: required, nothing is shown without it. */
	name: string
	/** The kind of activity: 0 playing, 1 streaming, 2 listening, 3 watching, 5 competing. */
	type: number
	details: string
	detailsUrl: string
	state: string
	stateUrl: string
	/** The id of a Discord application. Leave empty and the plugin makes one up for each profile. */
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
	/** For `custom`: a start and an end. */
	customStart: string
	customEnd: string
	/** For `countdown`: how many minutes, and whether it starts again each time it runs out. */
	countdownMinutes: string
	countdownLoop: boolean
	/** For `since` and `until`: the date, and how it repeats once it has passed. */
	timerDate: string
	timerRepeat: Repeat
	/** For `daily`: the two times of day, as `HH:MM`. */
	dailyFrom: string
	dailyTo: string
	partyCurrent: string
	partyMax: string
	button1Label: string
	button1Url: string
	button2Label: string
	button2Url: string
	/** Hides the presence while this text comes out empty. */
	showOnlyWhen: string
	/** Show it only at certain times. */
	scheduleOn: boolean
	/** The days it may be shown on, Sunday first, seven entries. */
	scheduleDays: boolean[]
	/** The times of day it may be shown between, as `HH:MM`. A "to" earlier than the "from" runs past midnight. */
	scheduleFrom: string
	scheduleTo: string
}

/** How the timer of the SoundCloud presence works. */
export type TimerMode = 'progress' | 'elapsed' | 'none'

/** Which text Discord shows after "Listening to": 0 SoundCloud, 1 the artist, 2 the track title. */
export type StatusText = 0 | 1 | 2

/** A track: what the SoundCloud presence shows. */
export interface Track {
	/** A link to the track on SoundCloud. Empty for tracks that came from Last.fm. */
	url: string
	kind?: 'track' | 'playlist'
	title: string
	artist: string
	artistUrl: string
	/** A link to the cover. Empty if there is none. */
	artwork: string
	/** The length in milliseconds, or 0 if it is not known. */
	duration: number
	/** When the track started playing (milliseconds). */
	startedAt: number
	/** For a track from Last.fm: the same song is told apart by `artist` and `title`, joined. */
	key?: string
	/** A link to search SoundCloud for the song, for tracks that have no link of their own. */
	searchUrl?: string
	album?: string
}

/** What is remembered about a track in the list of recent ones (no start time). */
export type RecentTrack = Omit<Track, 'startedAt'> & { startedAt?: number }

/** The settings of the SoundCloud presence. See `DEFAULT_SOUNDCLOUD` in `constants.ts` for what each one does. */
export interface SoundCloudSettings {
	clipboardOnOpen: boolean
	clearAtEnd: boolean
	showArtwork: boolean
	showArtist: boolean
	showButton: boolean
	hideWithSpotify: boolean
	coverLookup: boolean
	fallbackCover: boolean
	smallIcon: string
	buttonLabel: string
	timerMode: TimerMode
	statusText: StatusText
	autoEnabled: boolean
	lfmUser: string
	lfmKey: string
	pollSeconds: string
	current: Track | null
	recents: RecentTrack[]
}

/** The plugin's settings, stored as JSON. */
export interface RichPresenceSettings {
	/** The main switch: every presence is hidden while it is off. */
	enabled: boolean
	/** Send the presences when Discord starts. */
	applyOnStart: boolean
	/** How often the presences are sent again, in seconds, as text. `0` is never; the shortest is 15. */
	refreshSeconds: string
	/** How many presences can be shown at once, as text. The first profiles that are on, in the order of the list, are shown. */
	maxActive: string
	profiles: Profile[]
	soundcloud: SoundCloudSettings
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
	status_display_type?: number
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
	/** A line under it that says what it does. */
	s?: string
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

/** What the plugin keeps for each profile that is being shown, so each has its own timers and its own place in Discord. */
export interface Runtime {
	/** The profile it is for. */
	id: string
	/** The fake socket and process this profile's presence is sent as. Discord keeps one activity for each socket. */
	socket: string
	pid: number
	/** When the presence was last applied from scratch (milliseconds); the timers count from here. */
	appliedAt: number
	/** When the looping timer last restarted (milliseconds). */
	loopAnchor: number
	/** When the timer's meaning next changes (a date passes, a loop ends, midnight comes), or 0. The presence is sent again then. */
	changeAt: number
	/** Counts applications, so an older one that finishes late is dropped. */
	applySeq: number
	/** Whether a presence is currently sent for it. */
	live: boolean
}

/** Why a profile is shown or not. */
export type Standing =
	| 'shown'
	| 'off'
	| 'over the limit'
	| 'needs a name'
	| 'hidden by show only when'
	| 'second playing'
	| 'duplicate'
	| 'outside its schedule'
	| 'waiting for a track'
	| 'track finished'
	| 'hidden by spotify'

/** What the SoundCloud status line says. */
export type StatusState =
	| 'idle'
	| 'loading'
	| 'ok'
	| 'error'
	| 'ended'
	| 'hidden'

/** The status the SoundCloud preview shows. */
export interface Status {
	state: StatusState
	text: string
}

/** The song Last.fm says is playing. */
export interface NowPlaying {
	artist: string
	title: string
	album: string
	artwork: string
}

/** Last.fm's answer to a request: either data or an error with a message. */
export interface LastfmAnswer {
	error?: number
	message?: string
	[field: string]: unknown
}
