import type { BypassSettings } from './types'

/** The version shown in the settings and the report. Keep it equal to the one in `manifest.json`. */
export const VERSION = '3.0.1'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_BYPASS_STATUS'

/** The channel type of a direct message. */
export const DM = 1

/** The channel type of a group chat. */
export const GROUP_DM = 3

/** The message flag (bit 12) for a message sent without notifying. */
export const SILENT_MESSAGE_FLAG = 1 << 12

/** How long a menu sheet's subject is remembered, so a row is only added to the sheet that is open now (milliseconds). */
export const MENU_TARGET_MAX_AGE_MS = 5000

/** How many icon names are kept for the report. */
export const MAX_ICONS_SEEN = 14

/** The most chats or servers offered at once in the settings. */
export const MAX_SUGGESTIONS = 40

/** Parts of Discord's sheets that are not a chat's menu, so they are not taken for one. */
export const IGNORED_SHEET_PARTS =
	/^MessagesItem|^MessagesFast|^MessagesHeader|^FastList|^_FastList|^Guild|^HomeDrawer/

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: BypassSettings = {
	everyone: false,
	listsJson: '{"users":[],"channels":[],"guilds":[]}',
	ownBanner: false,
	ownBannerBuzz: true,
}
