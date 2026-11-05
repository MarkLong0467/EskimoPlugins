import type { HapticsSettings } from './types'

/** What the settings are before anything is saved: everything buzzes. */
export const DEFAULT_SETTINGS: HapticsSettings = {
	menus: true,
	discord: true,
	vibration: true,
}

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_HAPTICS'

/** Most lines kept in the log. The oldest line is dropped first. */
export const MAX_LOG_LINES = 60

/** Most different buzzes kept in the list on the settings screen. */
export const MAX_HEARD = 30

/** How many buzzes the settings screen shows at a time. */
export const SHOWN_HEARD = 12

/** The same buzz is written to the log at most this often (milliseconds), after the first time. */
export const LOG_REPEAT_MS = 5000

/** How long to wait before looking for Discord's menu opener a second time (milliseconds). */
export const MENU_RETRY_MS = 4000
