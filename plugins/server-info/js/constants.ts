/** The id of the Server Info sheet, so it can be closed again. */
export const SHEET_KEY = 'marklong-server-info'

/** The id of the sheet that lists friends, so it can be closed again. */
export const FRIENDS_KEY = 'marklong-server-info-friends'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_SERVER_INFO'

/** The label of the item added to the server menu. */
export const MENU_LABEL = 'Server Info'

/** When Discord's timestamps start: 1 January 2015, in milliseconds since 1970. */
export const DISCORD_EPOCH = 1420070400000

/** The number of bits a snowflake id uses for everything but the time (2 to the power 22). */
export const SNOWFLAKE_TIME_DIVISOR = 4194304

/** How long to wait for Discord to send the friends of a server before using what it already has (milliseconds). */
export const FRIENDS_TIMEOUT_MS = 1500

/** Fields that identify one particular menu item. They are dropped when an item is copied, so the copy is its own. */
export const IDENTITY_PROPS = [
	'id',
	'key',
	'testID',
	'nativeID',
	'index',
	'state',
	'onPress',
] as const

/** The icons tried, in order, for the menu item. */
export const MENU_ICONS = ['CircleInformationIcon', 'InformationIcon'] as const

/** The icon of rows that open something. */
export const CHEVRON_ICON = 'ChevronSmallRightIcon'
