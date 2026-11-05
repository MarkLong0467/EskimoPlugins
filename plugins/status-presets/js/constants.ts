import type { Choice, Preset, PresetSettings } from './types'

/** The version shown in the settings and the report. Keep it equal to the one in `manifest.json`. */
export const VERSION = '1.1.1'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_STATUS_PRESETS'

/** The longest text of a custom status, and the longest name of a preset. */
export const MAX_TEXT = 128
export const MAX_NAME = 32

/** The presets a new install starts with. */
export const STARTER_PRESETS: Preset[] = [
	{
		id: 'starter-available',
		name: 'Available',
		emoji: '🟢',
		text: '',
		status: 'online',
		custom: 'clear',
		clearAfter: 'never',
	},
	{
		id: 'starter-busy',
		name: 'Busy',
		emoji: '⛔',
		text: 'Busy, I will reply later',
		status: 'dnd',
		custom: 'set',
		clearAfter: '1h',
	},
	{
		id: 'starter-away',
		name: 'Away',
		emoji: '🚶',
		text: 'Away for a bit',
		status: 'idle',
		custom: 'set',
		clearAfter: '30m',
	},
	{
		id: 'starter-sleeping',
		name: 'Sleeping',
		emoji: '😴',
		text: 'Sleeping',
		status: 'dnd',
		custom: 'set',
		clearAfter: '8h',
	},
	{
		id: 'starter-gaming',
		name: 'Gaming',
		emoji: '🎮',
		text: 'In a game',
		status: 'dnd',
		custom: 'set',
		clearAfter: '4h',
	},
	{
		id: 'starter-invisible',
		name: 'Invisible',
		emoji: '',
		text: '',
		status: 'invisible',
		custom: 'keep',
		clearAfter: 'never',
	},
	{
		id: 'starter-clear',
		name: 'Clear custom status',
		emoji: '🧹',
		text: '',
		status: 'keep',
		custom: 'clear',
		clearAfter: 'never',
	},
]

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: PresetSettings = {
	presetsJson: JSON.stringify(STARTER_PRESETS),
	undoJson: '',
	inSheet: true,
	inEditor: true,
	buzz: true,
}

/** The statuses a preset can set, with the color of their dot. */
export const STATUSES: Choice[] = [
	{ v: 'keep', l: 'Keep my status', color: '#80848e' },
	{ v: 'online', l: 'Online', color: '#23a55a' },
	{ v: 'idle', l: 'Idle', color: '#f0b232' },
	{ v: 'dnd', l: 'Do Not Disturb', color: '#f23f43' },
	{ v: 'invisible', l: 'Invisible', color: '#80848e' },
]

/** What a preset can do to the custom status. */
export const CUSTOM_MODES: Choice[] = [
	{ v: 'keep', l: 'Leave it as it is' },
	{ v: 'set', l: 'Set a custom status' },
	{ v: 'clear', l: 'Remove my custom status' },
]

/** When the status can go back to normal. `midnight` is worked out when the preset is applied. */
export const CLEAR_AFTER: Choice[] = [
	{ v: 'never', l: "Don't clear", ms: 0 },
	{ v: '15m', l: '15 minutes', ms: 15 * 60000 },
	{ v: '30m', l: '30 minutes', ms: 30 * 60000 },
	{ v: '1h', l: '1 hour', ms: 60 * 60000 },
	{ v: '2h', l: '2 hours', ms: 2 * 60 * 60000 },
	{ v: '4h', l: '4 hours', ms: 4 * 60 * 60000 },
	{ v: '8h', l: '8 hours', ms: 8 * 60 * 60000 },
	{ v: 'midnight', l: 'Until midnight', ms: 0 },
]

/** Emojis offered as quick picks. */
export const EMOJI_CHOICES = [
	'😴',
	'🎮',
	'🍽️',
	'🚗',
	'💼',
	'📚',
	'🏃',
	'🎧',
	'🏠',
	'🚫',
	'💬',
	'🔴',
	'🟢',
	'🌙',
	'☕',
	'✈️',
	'🤒',
	'🎉',
	'📵',
	'🧘',
]

/** How many lines of recent actions are kept. */
export const LOG_SIZE = 10

/** How long after applying a preset it is checked that Discord took it (milliseconds). */
export const VERIFY_DELAY_MS = 1200

/** How long a "tap again to confirm" stays armed (milliseconds). */
export const CONFIRM_MS = 4000
