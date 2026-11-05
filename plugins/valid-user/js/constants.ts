/** Prefix for this plugin's console messages. */
export const TAG = '[valid-user]'

/**
 * Matches a user mention as Discord stores it: `<@id>`, or `<@!id>` for the old nickname form.
 * The id is a snowflake of 17 to 20 digits. Capture group 1 is the id.
 */
export const MENTION_PATTERN = /<@!?(\d{17,20})>/g

/** Wait between two user lookups, so a long message list cannot flood Discord's API. */
export const REQUEST_GAP_MS = 300

/** Most users waiting for a lookup at one time. Mentions beyond this are ignored until the queue has room. */
export const MAX_QUEUE = 200

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
