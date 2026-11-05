/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_ROLE_OPTIONS'

/** The label of Discord's own menu item that the new items are added under. */
export const ID_LABEL = 'Copy Role ID'

/** The names Discord's menu items use for what happens when they are tapped. */
export const PRESS_PROPS = [
	'action',
	'onPress',
	'onSelect',
	'onClick',
	'callback',
	'handler',
] as const

/** Fields that identify one particular menu item. They are dropped when an item is copied, so each copy is its own. */
export const IDENTITY_PROPS = [
	'id',
	'key',
	'testID',
	'nativeID',
	'index',
	'state',
] as const

/** A menu is not decorated again within this time of the last time (milliseconds). Discord draws a menu several times. */
export const DEBOUNCE_MS = 400

/** How long a role that was noted from a menu stays the best guess (milliseconds). */
export const SEEN_TTL_MS = 60000

/** How deep the plugin looks into a drawn element before giving up. */
export const MAX_TREE_DEPTH = 25

/** Where Discord keeps role icons. `size` is the picture's width and height in pixels. */
export const roleIconUrl = (roleId: string, icon: string) =>
	`https://cdn.discordapp.com/role-icons/${roleId}/${icon}.png?size=512`
