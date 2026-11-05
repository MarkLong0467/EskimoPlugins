/** Prefix for this plugin's console messages. */
export const TAG = '[nef-viewer]'

/** File names the plugin treats as Nikon RAW files: `.nef` (RAW) and `.nrw` (Coolpix RAW), in any letter case. */
export const RAW_FILE_PATTERN = /\.(nef|nrw)$/i

/** Most conversions that run at the same time. Each one downloads part of a large file, so keep it low. */
export const MAX_CONCURRENT = 2

/** Flux events that carry one message in `payload.message`. */
export const SINGLE_MESSAGE_EVENTS = [
	'MESSAGE_CREATE',
	'MESSAGE_UPDATE',
] as const

/** Flux events that carry a list of messages in `payload.messages`, for a channel, pins or mentions. */
export const MESSAGE_LIST_EVENTS = [
	'LOAD_MESSAGES_SUCCESS',
	'LOAD_MESSAGES_AROUND_SUCCESS',
	'LOAD_PINNED_MESSAGES_SUCCESS',
	'LOAD_RECENT_MENTIONS_SUCCESS',
] as const
