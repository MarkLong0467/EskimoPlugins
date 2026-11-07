/**
 * The heart of the plugin, and a port of Equicord's SilenceUsers `interceptor`.
 *
 * A message from a silenced person is changed before Discord's stores see it: `mention_everyone` is made false and
 * `mention_roles` and `mentions` are emptied. With nothing in them the message pings nobody, so it adds no number to the server
 * badge, no red mention count and no in-app pop-up, and the message itself still arrives and is read like any other.
 *
 * Everything here is plain functions on plain objects, so it can be tested without Discord.
 */

/** Something with named fields. */
export type Bag = Record<string, unknown>
export const isBag = (value: unknown): value is Bag =>
	value != null && typeof value === 'object'

/** Who and what is silenced. */
export interface Rules {
	/** The people whose pings are silenced. */
	users: ReadonlySet<string>
	/** Everyone's pings are silenced. */
	all: boolean
	/** `@everyone` and `@here` from anyone are silenced. */
	everyone: boolean
	/** Role pings from anyone are silenced. */
	roles: boolean
}

/** What a message was before it was changed, and what was done to it. */
export interface Outcome {
	/** The author's id, or nothing when the message has none. */
	author?: string
	/** The author is silenced, by name or because everyone is. */
	silenced: boolean
	/** The message pinged you directly (it mentions you, or replies to you). */
	direct: boolean
	/** It had an `@everyone` or `@here`. */
	everyone: boolean
	/** It had a role ping. */
	roles: boolean
	/** Whether anything in it was cleared. */
	changed: boolean
}

/** The id text of a user in a message's `mentions`, which hold whole users (or ids, in some payloads). */
const mentionId = (entry: unknown): string =>
	String(isBag(entry) ? (entry.id ?? '') : (entry ?? ''))

/**
 * Silences what the rules say in a message, changing it in place.
 *
 * @param message The message as Discord's gateway sends it (`author`, `mentions`, `mention_roles`, `mention_everyone`).
 * @param rules Who and what to silence.
 * @param me Your id, so a ping at you can be told from a ping at someone else.
 */
export function silenceMessage(
	message: Bag,
	rules: Rules,
	me?: string,
): Outcome {
	const author = isBag(message.author) ? String(message.author.id ?? '') : ''
	const mentions = Array.isArray(message.mentions) ? message.mentions : []
	const roles = Array.isArray(message.mention_roles)
		? message.mention_roles
		: Array.isArray(message.mentionRoles)
			? message.mentionRoles
			: []
	const everyone =
		message.mention_everyone === true || message.mentionEveryone === true
	const outcome: Outcome = {
		author: author || undefined,
		silenced: false,
		direct: me !== undefined && mentions.some(entry => mentionId(entry) === me),
		everyone,
		roles: roles.length > 0,
		changed: false,
	}
	if (!author) return outcome

	outcome.silenced = rules.all || rules.users.has(author)
	if (outcome.silenced) {
		// Exactly what Equicord does: nothing in the message can ping anyone.
		outcome.changed = mentions.length > 0 || everyone || roles.length > 0
		message.mention_everyone = false
		message.mention_roles = []
		message.mentions = []
		if ('mentionEveryone' in message) message.mentionEveryone = false
		if ('mentionRoles' in message) message.mentionRoles = []
		return outcome
	}
	if (rules.everyone && everyone) {
		message.mention_everyone = false
		if ('mentionEveryone' in message) message.mentionEveryone = false
		outcome.changed = true
	}
	if (rules.roles && roles.length > 0) {
		message.mention_roles = []
		if ('mentionRoles' in message) message.mentionRoles = []
		outcome.changed = true
	}
	return outcome
}

/** The message inside a notification event, wherever the event keeps it. */
export function notificationMessage(event: unknown): Bag | undefined {
	if (!isBag(event)) return undefined
	if (isBag(event.message)) return event.message
	if (isBag(event.notification) && isBag(event.notification.message))
		return event.notification.message
	return undefined
}

/** Whether a message is from a silenced person by name (not because everyone is silenced). */
export function isFromSilenced(
	message: Bag | undefined,
	users: ReadonlySet<string>,
): boolean {
	if (!message || !isBag(message.author)) return false
	const author = String(message.author.id ?? '')
	return author !== '' && users.has(author)
}

/** Reads ids out of what a person typed or pasted: ids, `<@id>` mentions, separated by commas, spaces or lines. */
export function parseIds(text: string): { valid: string[]; invalid: string[] } {
	const valid: string[] = []
	const invalid: string[] = []
	for (const piece of text.split(/[\s,;]+/)) {
		const part = piece.trim()
		if (!part) continue
		const id = part.replace(/^<@!?(\d+)>$/, '$1')
		if (/^\d{15,21}$/.test(id)) {
			if (!valid.includes(id)) valid.push(id)
		} else invalid.push(part)
	}
	return { valid, invalid }
}
