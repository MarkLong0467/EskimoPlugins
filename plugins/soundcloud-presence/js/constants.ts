import type {
	Choice,
	Output,
	SoundCloudSettings,
	StatusText,
	TimerMode,
} from './types'

/** The prefix of the plugin's log lines. */
export const TAG = '[soundcloud-presence]'

/** The fake socket and process the status is sent as. */
export const SOCKET = 'EskimoSoundCloudPresence'
export const PID = 1338

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'ESKIMO_SOUNDCLOUD_PRESENCE'

/** SoundCloud's orange, used in the preview. */
export const ORANGE = '#FF5500'

/** How many recent tracks are kept. */
export const MAX_RECENTS = 8

/** A SoundCloud link, anywhere in a text. */
export const LINK_RE =
	/https?:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\/[^\s<>"')]+/i

/** The hash of the empty picture Last.fm sends when it has no cover. */
export const LASTFM_BLANK = '2a96cbd8b46e442fc41c2b86b821562f'

/** The variables the Rich Presence plugin can show from this one. */
export const RICH_VARS = [
	'sc_title',
	'sc_artist',
	'sc_url',
	'sc_art',
	'sc_button',
]

/**
 * Discord allows a client 5 presence updates per 20 seconds. Four are sent inside any 20 seconds, so a song change goes
 * out at once and only a long burst has to wait. Repeats of the same update are dropped.
 */
export const RATE_MAX = 4
export const RATE_WINDOW_MS = 20000

/** A stuck request must not block the next check. */
export const REQUEST_TIMEOUT_MS = 8000

/** When a track with a known length ends, Last.fm is asked right away what plays next (this long after the end). */
export const END_POLL_GRACE_MS = 1000

/** The shortest time between two checks of Last.fm (seconds). */
export const MIN_POLL_SECONDS = 5

/** Between two songs Last.fm can briefly report nothing. One quick second look stops the status flickering off. */
export const MISS_RECHECK_MS = 8000

/** Shown as the cover when no real one can be found. It lives in the plugin's own repository. */
export const FALLBACK_COVER =
	'https://raw.githubusercontent.com/MarkLong0467/EskimoPlugins/main/plugins/soundcloud-presence/cover.png'

/** How long a text field waits after typing before it saves (milliseconds). */
export const FIELD_COMMIT_MS = 300

export const TIMER_MODES: Choice<TimerMode>[] = [
	{
		v: 'progress',
		l: 'Progress bar',
		s: 'Counts up to the length of the track, then the status clears.',
	},
	{
		v: 'elapsed',
		l: 'Time elapsed',
		s: 'Counts up from when the track started.',
	},
	{ v: 'none', l: 'No timer', s: 'Shows only the title and artist.' },
]

export const STATUS_TEXTS: Choice<StatusText>[] = [
	{ v: 0, l: 'SoundCloud', s: 'Listening to SoundCloud' },
	{ v: 1, l: 'Artist name', s: 'Listening to the artist' },
	{ v: 2, l: 'Track title', s: 'Listening to the song' },
]

export const POLLS: Choice<string>[] = [
	{
		v: '5',
		l: 'Every 5 seconds',
		s: 'Fastest. A new song shows up within seconds. Uses the most battery and data.',
	},
	{ v: '10', l: 'Every 10 seconds', s: 'Quick, and a fair balance.' },
	{ v: '15', l: 'Every 15 seconds', s: 'A little lighter.' },
	{
		v: '30',
		l: 'Every 30 seconds',
		s: 'Slower to notice a new song. Lighter on battery.',
	},
	{ v: '60', l: 'Every minute', s: 'Slowest. Lightest on battery.' },
]

export const OUTPUTS: Choice<Output>[] = [
	{
		v: 'own',
		l: 'This plugin',
		s: 'SoundCloud Presence sets your status itself.',
	},
	{
		v: 'rich',
		l: 'My Rich Presence plugin',
		s: 'Hands the track to Rich Presence 1.3 or newer. In its settings tap "Use for SoundCloud".',
	},
]

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: SoundCloudSettings = {
	enabled: true,
	applyOnStart: true,
	clipboardOnOpen: false,
	clearAtEnd: true,
	showArtwork: true,
	showArtist: true,
	showButton: true,
	hideWithSpotify: true,
	coverLookup: true,
	fallbackCover: true,
	smallIcon: '',
	buttonLabel: 'Listen on SoundCloud',
	timerMode: 'progress',
	statusText: 0,
	output: 'own',
	autoEnabled: false,
	lfmUser: '',
	lfmKey: '',
	pollSeconds: '10',
	fastDefaultApplied: false,
	current: null,
	recents: [],
}
