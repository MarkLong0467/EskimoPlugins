import { MAX_QUEUE, REQUEST_GAP_MS } from './constants'
import { getStoredMessage, isKnownUser, redrawMessage } from './discord'
import type { UserActions } from './types'

/**
 * The lookup queue.
 *
 * Unknown users are collected here and fetched one at a time. When a user arrives, every message that mentioned them
 * is drawn again.
 *
 * State lives at module level because there is only ever one running copy of the plugin.
 */

/** True between `start` and `stop`. Late results are dropped once it is false. */
let active = false

/** Discord's user actions, once the module has been found. */
let actions: UserActions | undefined

/** User ids waiting for a lookup, oldest first. */
const queue: string[] = []

/** For each waiting user id, the messages that mention them: message id to channel id. */
const waiting = new Map<string, Map<string, string>>()

/** Users that could not be fetched (deleted, blocked). They are not tried again until Discord reloads. */
const failed = new Set<string>()

/** True while a lookup is in flight. Only one runs at a time. */
let running = false

/** Turns the queue on. The returned function turns it off and forgets everything that was waiting. */
export function startLookups(): () => void {
	active = true
	return () => {
		active = false
		queue.length = 0
		waiting.clear()
	}
}

/** Provides Discord's user actions as soon as the module is found, and starts working through the queue. */
export function setUserActions(found: UserActions): void {
	actions = found
	pump()
}

/**
 * Remembers that `messageId` mentions the unknown user `userId`, and queues the lookup if there is none yet.
 *
 * Mentions of known users, of users that already failed, and of new users beyond `MAX_QUEUE` are ignored.
 */
export function enqueue(
	userId: string,
	messageId: string,
	channelId: string,
): void {
	if (isKnownUser(userId) || failed.has(userId)) return

	let targets = waiting.get(userId)
	if (!targets) {
		if (queue.length >= MAX_QUEUE) return
		targets = new Map()
		waiting.set(userId, targets)
		queue.push(userId)
	}
	targets.set(messageId, channelId)
}

/**
 * Fetches the next waiting user, if nothing is running. When it is done (or has failed) it redraws the messages,
 * waits `REQUEST_GAP_MS` and takes the next one.
 *
 * A lookup that throws before it even returns a promise is treated like one that failed.
 */
export function pump(): void {
	if (running || !active || !actions) return
	const id = queue.shift()
	if (!id) return

	running = true
	let lookup: Promise<unknown>
	try {
		lookup = Promise.resolve(actions.getUser(id))
	} catch (error) {
		lookup = Promise.reject(error)
	}

	lookup
		.catch(() => failed.add(id))
		.then(() => redraw(id))
		.finally(() => {
			running = false
			setTimeout(pump, REQUEST_GAP_MS)
		})
}

/** Draws every message that mentioned `userId` again, now that the user is known. */
function redraw(userId: string): void {
	const targets = waiting.get(userId)
	waiting.delete(userId)
	if (!active || !targets || !isKnownUser(userId)) return

	for (const [messageId, channelId] of targets) {
		const message = getStoredMessage(channelId, messageId)
		if (message) redrawMessage(message, channelId)
	}
}
