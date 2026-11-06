import type { TextReactSettings } from './types'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_TEXT_REACT'

/** The id of the sheet that asks for the text, so it can be closed again. */
export const SHEET_KEY = 'marklong.text-react'

/** The label of the item added to the message menu. */
export const MENU_LABEL = 'Text React'

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: TextReactSettings = {
	menu: true,
	warn: true,
	delaySeconds: '1',
}

/** The pauses offered between two reactions, in seconds. Discord limits how fast reactions can be added. */
export const DELAY_CHOICES = ['0.5', '1', '2', '3']

/** How long a message noticed in the menu stays the target of "Text React" (milliseconds). */
export const TARGET_MAX_AGE_MS = 5000

/** The most characters of text that are turned into reactions. A message can carry at most 20 different reactions. */
export const MAX_REACTIONS = 20

/** The names Discord's menu items use for what happens when they are tapped. */
export const PRESS_PROPS = [
	'action',
	'onPress',
	'onSelect',
	'onClick',
	'callback',
	'handler',
] as const

/** Fields that identify one particular menu item. They are dropped when an item is copied, so the copy is its own. */
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
export const MENU_ICONS = ['KeyboardIcon', 'ic_keyboard_24px', 'ic_keyboard']
