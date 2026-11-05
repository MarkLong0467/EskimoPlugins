/** How the timer on the status works. */
export type TimerMode = 'progress' | 'elapsed' | 'none'

/** Which text Discord shows after "Listening to": 0 SoundCloud, 1 the artist, 2 the track title. */
export type StatusText = 0 | 1 | 2

/** Who sets the status: this plugin, or the Rich Presence plugin. */
export type Output = 'own' | 'rich'

/** A track: what the status shows. */
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

/** What the plugin remembers about a track in the list of recent ones (no start time). */
export type RecentTrack = Omit<Track, 'startedAt'> & { startedAt?: number }

/** The plugin's settings, stored as JSON. See `DEFAULT_SETTINGS` in `constants.ts` for what each one does. */
export interface SoundCloudSettings {
	enabled: boolean
	applyOnStart: boolean
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
	output: Output
	autoEnabled: boolean
	lfmUser: string
	lfmKey: string
	pollSeconds: string
	fastDefaultApplied: boolean
	current: Track | null
	recents: RecentTrack[]
}

/** The activity in the form Discord's `LOCAL_ACTIVITY_UPDATE` expects. */
export interface Activity {
	application_id: string
	name: string
	type: number
	flags: number
	details: string
	state?: string
	details_url?: string
	state_url?: string
	status_display_type?: number
	timestamps?: { start: number; end?: number }
	assets?: Record<string, string>
	buttons?: string[]
	metadata?: { button_urls: string[] }
}

/** The song Last.fm says is playing. */
export interface NowPlaying {
	artist: string
	title: string
	album: string
	artwork: string
}

/** What the preview shows below the track. */
export type StatusState =
	| 'idle'
	| 'loading'
	| 'ok'
	| 'error'
	| 'ended'
	| 'hidden'
export interface Status {
	state: StatusState
	text: string
}

/** A choice in a list of radio rows, with a line under it. */
export interface Choice<V = string | number> {
	v: V
	l: string
	s: string
}

/** Last.fm's answer to a request: either data or an error with a message. */
export interface LastfmAnswer {
	error?: number
	message?: string
	[field: string]: unknown
}

/** An update waiting to be sent: the activity and its JSON, to tell repeats. */
export interface PendingSend {
	activity: Activity | null
	json: string
}
