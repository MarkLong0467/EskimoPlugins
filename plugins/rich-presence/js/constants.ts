import type { Choice, TimestampMode } from './types'

/** The prefix of the plugin's log lines. */
export const TAG = '[rich-presence]'

/** The fake socket and process the presence is sent as. */
export const SOCKET = 'EskimoRichPresence'
export const PID = 1337

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'ESKIMO_RICH_PRESENCE'

/**
 * Discord turns an image link into a presence image through an application. Any valid application works for this, so it
 * is only the fallback when you set none of your own.
 */
export const IMAGE_APP_ID = '1054951789318909972'

/** The kinds of activity. */
export const TYPES: Choice<number>[] = [
	{ v: 0, l: 'Playing' },
	{ v: 1, l: 'Streaming' },
	{ v: 2, l: 'Listening to' },
	{ v: 3, l: 'Watching' },
	{ v: 5, l: 'Competing in' },
]

/** The kinds of timer. */
export const TIME_MODES: Choice<TimestampMode>[] = [
	{ v: 'none', l: 'No timer' },
	{ v: 'elapsed', l: 'Elapsed since applied' },
	{ v: 'clock', l: 'Same as your current time' },
	{ v: 'countdown', l: 'Countdown from applied' },
	{ v: 'custom', l: 'Custom (loops when start and end are set)' },
	{ v: 'external', l: 'From another plugin (SoundCloud Presence)' },
]

/** The fields of a profile that are copied, pasted and exported (everything except its id). */
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
	'partyCurrent',
	'partyMax',
	'button1Label',
	'button1Url',
	'button2Label',
	'button2Url',
	'showOnlyWhen',
] as const

/** The names of days and months for the `{day}` and `{month}` variables. */
export const DAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
]
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
