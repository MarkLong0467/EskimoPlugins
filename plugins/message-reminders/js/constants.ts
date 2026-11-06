import type { ReminderSettings } from './types'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_MESSAGE_REMINDERS'

/** The id of the sheet that picks the time. */
export const PICK_SHEET_KEY = 'marklong.message-reminders.pick'

/** The id of the sheet that shows reminders that are due. */
export const DUE_SHEET_KEY = 'marklong.message-reminders.due'

/** The id of the sheet that shows one reminder from the settings. */
export const ITEM_SHEET_KEY = 'marklong.message-reminders.item'

/** The label of the item added to the message menu. */
export const MENU_LABEL = 'Remind Me'

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: ReminderSettings = {
	menu: true,
	sheet: true,
	snoozeMinutes: 10,
	reminders: [],
}

/** The snooze lengths offered in the settings, in minutes. */
export const SNOOZE_CHOICES = [5, 10, 15, 30, 60]

/** How often the plugin looks for reminders that are due (milliseconds). */
export const CHECK_MS = 15_000

/** How long after the plugin starts the first look happens, so Discord has finished opening (milliseconds). */
export const FIRST_CHECK_MS = 6_000

/** How long a message noticed in the menu stays the target of "Remind Me" (milliseconds). */
export const TARGET_MAX_AGE_MS = 5000

/** The most characters of a message kept as its preview. */
export const PREVIEW_CHARS = 140

/** The most reminders the due sheet lists at once. The rest show in the settings. */
export const DUE_SHOWN = 4

/** The most minutes accepted for a custom time (999999 minutes is about 2 years). */
export const MAX_MINUTES = 999_999

/** The names Discord's menu items use for what happens when they are tapped. */
export const PRESS_PROPS = [
	'action',
	'onPress',
	'onSelect',
	'onClick',
	'callback',
	'handler',
] as const

/** Props that identify the item a copy came from, which the new item must not keep. */
export const IDENTITY_PROPS = [
	'id',
	'key',
	'testID',
	'nativeID',
	'index',
	'state',
] as const

/** Labels of items that the message menu has. A menu with two of them is taken for the message menu. */
export const MESSAGE_LABELS: Record<string, 1> = {
	Reply: 1,
	'Copy Text': 1,
	'Add Reaction': 1,
	'Mark Unread': 1,
	'Edit Message': 1,
	'Delete Message': 1,
	'Pin Message': 1,
	'Unpin Message': 1,
	'Copy Message Link': 1,
	'Copy Message ID': 1,
	Forward: 1,
	Report: 1,
}

/** The labels of the rows that copy something. The new row goes into the box that holds them. */
export const COPY_LABELS = ['Copy Text', 'Copy Message Link', 'Copy Message ID']

/** What the message menu's icons are called, so it is also found in other languages. */
export const MESSAGE_ICONS = [
	/reply/i,
	/copy|clipboard/i,
	/pin/i,
	/link/i,
	/reaction|emoji/i,
	/edit|pencil/i,
	/trash|delete/i,
	/bookmark|unread/i,
]

/** The icons tried, in order, for the menu item. */
export const MENU_ICONS = [
	'ClockIcon',
	'ic_clock_24px',
	'BellIcon',
	'ic_notification_bell',
	'ic_clock',
]
