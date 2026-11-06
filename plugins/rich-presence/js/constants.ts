import type {
	Choice,
	Repeat,
	SoundCloudSettings,
	Standing,
	StatusText,
	TimerMode,
	TimestampMode,
} from './types'

/** The prefix of the plugin's log lines. */
export const TAG = '[rich-presence]'

/**
 * The fake sockets and processes the presences are sent as. Discord's local activity store keeps one activity for each
 * socket, so each profile that is shown gets its own: `EskimoRichPresence:<profile id>`, with the next process number.
 */
export const SOCKET_PREFIX = 'EskimoRichPresence:'
export const PID_BASE = 1337

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'ESKIMO_RICH_PRESENCE'

/**
 * How many presences can be shown at once by default, and the most the setting allows. Three is as many as Discord seems to
 * show on a profile.
 */
export const DEFAULT_MAX_ACTIVE = 3
export const MAX_ACTIVE_LIMIT = 3

/** How long to wait between sending one profile and the next, so Discord is not given a burst of presence updates (ms). */
export const SEND_GAP_MS = 400

/**
 * Discord turns an image link into a presence image through an application. Any valid application works for this, so it
 * is only the fallback when you set none of your own.
 */
export const IMAGE_APP_ID = '1054951789318909972'

/** The kinds of activity. */
export const TYPES: Choice<number>[] = [
	{ v: 0, l: 'Playing', s: 'Only one Playing can show at a time' },
	{ v: 2, l: 'Listening to' },
	{ v: 3, l: 'Watching' },
	{ v: 5, l: 'Competing in' },
	{ v: 1, l: 'Streaming', s: 'Needs a Twitch or YouTube link' },
]

/** The kinds of timer, each with a line that says what it does. */
export const TIME_MODES: Choice<TimestampMode>[] = [
	{ v: 'none', l: 'No timer', s: 'Nothing counts.' },
	{
		v: 'elapsed',
		l: 'Since switched on',
		s: 'Counts up from when this presence was switched on or applied.',
	},
	{
		v: 'app',
		l: 'Since Discord opened',
		s: 'Counts up from when you opened Discord.',
	},
	{
		v: 'since',
		l: 'Since a date',
		s: 'Counts up from a date you pick, such as "days since" something.',
	},
	{
		v: 'until',
		l: 'Until a date',
		s: 'Counts down to a date. It can start over every day, week, month or year.',
	},
	{
		v: 'countdown',
		l: 'Countdown',
		s: 'Counts down a number of minutes. It can start over each time it runs out.',
	},
	{ v: 'midnight', l: 'Until midnight', s: 'Counts down the rest of today.' },
	{
		v: 'clock',
		l: 'Time of day',
		s: 'Counts up from midnight, so it reads like the clock.',
	},
	{
		v: 'daily',
		l: 'Between two times each day',
		s: 'A progress bar from one time to another, every day.',
	},
	{
		v: 'custom',
		l: 'Start and end',
		s: 'Your own start and end. With both set, the same length starts over again and again.',
	},
	{
		v: 'external',
		l: 'From the SoundCloud track',
		s: 'The start and end of the track the SoundCloud presence is showing.',
	},
]

/** How a date repeats. */
export const REPEATS: Choice<Repeat>[] = [
	{ v: 'none', l: 'Never', s: 'Once the date has passed, the timer stops.' },
	{ v: 'daily', l: 'Every day', s: 'Goes to the same time tomorrow.' },
	{
		v: 'weekly',
		l: 'Every week',
		s: 'Goes to the same day and time next week.',
	},
	{ v: 'monthly', l: 'Every month', s: 'Goes to the same day next month.' },
	{ v: 'yearly', l: 'Every year', s: 'For birthdays and the like.' },
]

/** The names of the days, Sunday first, and the same shortened. */
export const WEEKDAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
]
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The fields of a profile that are copied, pasted and exported (everything except its id and whether it is on). */
export const PROFILE_KEYS = [
	'label',
	'name',
	'type',
	'details',
	'detailsUrl',
	'state',
	'stateUrl',
	'applicationId',
	'streamUrl',
	'largeImage',
	'largeUrl',
	'largeText',
	'smallImage',
	'smallUrl',
	'smallText',
	'timestampMode',
	'customStart',
	'customEnd',
	'countdownMinutes',
	'countdownLoop',
	'timerDate',
	'timerRepeat',
	'dailyFrom',
	'dailyTo',
	'partyCurrent',
	'partyMax',
	'button1Label',
	'button1Url',
	'button2Label',
	'button2Url',
	'showOnlyWhen',
	'scheduleOn',
	'scheduleDays',
	'scheduleFrom',
	'scheduleTo',
] as const

/** The names of days and months for the `{day}` and `{month}` variables. */
export const DAYS = WEEKDAYS
export const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
]

/** Links that end like a picture are used as they are. */
export const IMAGE_TYPES = /\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i

/** How long a change in the settings waits before the presence is sent, so typing sends it once (milliseconds). */
export const APPLY_DELAY_MS = 200

/** How long a text field waits after typing before it saves (milliseconds). */
export const FIELD_COMMIT_MS = 300

/** The shortest refresh interval (seconds). */
export const MIN_REFRESH_SECONDS = 15

/** How long after Discord reconnects the presence is sent again (milliseconds). Discord drops local activities on reconnect. */
export const RECONNECT_DELAY_MS = 3000

/** The most characters of a button label. */
export const MAX_BUTTON_LABEL = 32

/// SOUNDCLOUD

/** SoundCloud's orange, used in the preview. */
export const ORANGE = '#FF5500'

/** How many recent tracks are kept. */
export const MAX_RECENTS = 8

/** A SoundCloud link, anywhere in a text. */
export const LINK_RE =
	/https?:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\/[^\s<>"')]+/i

/** The hash of the empty picture Last.fm sends when it has no cover. */
export const LASTFM_BLANK = '2a96cbd8b46e442fc41c2b86b821562f'

/** The variables the custom profiles can use to show the SoundCloud track. */
export const RICH_VARS = [
	'sc_title',
	'sc_artist',
	'sc_url',
	'sc_art',
	'sc_button',
]

/**
 * Discord allows a client 5 presence updates per 20 seconds. Four of the SoundCloud presence's are sent inside any 20 seconds,
 * so a song change goes out at once and only a long burst has to wait. Repeats of the same update are dropped.
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

/** How long after opening Discord the clipboard is looked at (milliseconds). */
export const CLIPBOARD_AT_START_MS = 2000
export const CLIPBOARD_ON_RETURN_MS = 800

/** How long after Spotify changes the SoundCloud presence is checked (milliseconds). */
export const SPOTIFY_DELAY_MS = 1500

/** Shown as the cover when no real one can be found. It lives in this plugin's folder in the repository. */
export const FALLBACK_COVER =
	'https://raw.githubusercontent.com/MarkLong0467/EskimoPlugins/main/plugins/rich-presence/cover.png'

/** The timers of the SoundCloud presence. */
export const SC_TIMER_MODES: Choice<TimerMode>[] = [
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

/** What Discord shows after "Listening to". */
export const SC_STATUS_TEXTS: Choice<StatusText>[] = [
	{ v: 0, l: 'SoundCloud', s: 'Listening to SoundCloud' },
	{ v: 1, l: 'Artist name', s: 'Listening to the artist' },
	{ v: 2, l: 'Track title', s: 'Listening to the song' },
]

/** How often Last.fm is checked. */
export const SC_POLLS: Choice<string>[] = [
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

/** The SoundCloud settings used until the user changes something. */
export const DEFAULT_SOUNDCLOUD: SoundCloudSettings = {
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
	autoEnabled: false,
	lfmUser: '',
	lfmKey: '',
	pollSeconds: '10',
	current: null,
	recents: [],
}

/** What each standing is called on the settings screen. */
export const STANDING_TEXT: Record<Standing, string> = {
	shown: 'Shown on your profile',
	off: 'Off',
	'over the limit': 'On, but over the limit. It shows when there is room',
	'needs a name': 'On, but it needs an Activity name',
	'hidden by show only when': 'On, hidden while its "show only when" is empty',
	'second playing':
		'On, but Discord shows only one Playing at a time. Change its type to Listening to, Watching or Competing in',
	duplicate:
		'On, but it is the same type, application and name as one above, which Discord counts as one',
	'outside its schedule': 'On, waiting for its schedule',
	'waiting for a track':
		'On, waiting for a SoundCloud track. Paste a link or turn on Last.fm',
	'track finished': 'On, the track has finished',
	'hidden by spotify': 'On, hidden while Spotify is showing',
}
