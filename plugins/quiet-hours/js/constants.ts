import type { QuietSettings, QuietStatus } from './types'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_QUIET_HOURS'

/** The id of the sheet that picks a time of day. */
export const TIME_SHEET_KEY = 'marklong.quiet-hours.time'

/** How often the plugin looks at the clock (milliseconds). */
export const CHECK_MS = 15_000

/** How long after the plugin starts the first look happens, so Discord has finished opening (milliseconds). */
export const FIRST_CHECK_MS = 5_000

/** How long after writing the status it is checked that Discord took it (milliseconds). */
export const VERIFY_DELAY_MS = 1500

/** Days of the week, Sunday first, as Date#getDay counts them. */
export const DAY_NAMES = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
]

/** The same, shortened for the day buttons. */
export const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** The settings used until the user changes something: every night, 11 PM to 7 AM, Do Not Disturb. */
export const DEFAULT_SETTINGS: QuietSettings = {
	enabled: false,
	days: [true, true, true, true, true, true, true],
	from: 23 * 60,
	to: 7 * 60,
	status: 'dnd',
	showCustom: false,
	customText: 'Quiet hours',
	customEmoji: '🌙',
	buzz: true,
	skippedEnd: 0,
	appliedJson: '',
}

/** The statuses quiet hours can set, with the color of their dot. */
export const STATUS_CHOICES: Array<{
	v: QuietStatus
	l: string
	help: string
	color: string
}> = [
	{
		v: 'dnd',
		l: 'Do Not Disturb',
		help: 'Silences notifications.',
		color: '#f23f43',
	},
	{
		v: 'idle',
		l: 'Idle',
		help: 'Shows you as away. Notifications still come.',
		color: '#f0b232',
	},
	{
		v: 'invisible',
		l: 'Invisible',
		help: 'Shows you as offline.',
		color: '#80848e',
	},
]

/** The shortest a window can be (minutes). Two times that are equal give no window at all. */
export const MIN_WINDOW_MINUTES = 1

/** How many lines of recent events the settings screen shows. */
export const LOG_SIZE = 8

/** The most characters of the custom status. */
export const MAX_CUSTOM_TEXT = 128

/** Minutes offered in the time picker. */
export const MINUTE_CHOICES = [0, 15, 30, 45]
