/**
 * Discord shows `<@id>` as @unknown-user when it has never seen that user.
 * This looks up such users in the background and redraws the message, so the mention resolves
 * on its own. It covers message text, embeds (title, description, fields, author, footer)
 * and forwarded messages.
 */
import { Dispatcher } from '@valenced/discord/common/flux'
import { onFluxEventDispatched, Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

interface UserActions {
	getUser(id: string): Promise<unknown>
	fetchCurrentUser: unknown
}

const Tag = '[valid-user]'
const MentionPattern = /<@!?(\d{17,20})>/g
const RequestGapMs = 300
const MaxQueue = 200

let active = false
let actions: UserActions | undefined
const queue: string[] = []
/** User ID to the messages that mention it. */
const waiting = new Map<string, Map<string, string>>()
/** Users that could not be fetched (deleted, blocked). Not retried until reload. */
const failed = new Set<string>()
let running = false

function isKnown(id: string): boolean {
	return !!(Stores.UserStore as any)?.getUser?.(id)
}

/** Every string in a message that Discord renders as markdown. */
function* texts(message: any): Generator<string> {
	if (typeof message.content === 'string') yield message.content
	for (const embed of message.embeds ?? []) {
		for (const value of [
			embed?.title,
			embed?.description,
			embed?.author?.name,
			embed?.footer?.text,
			embed?.rawTitle,
			embed?.rawDescription,
		])
			if (typeof value === 'string') yield value
		for (const field of embed?.fields ?? []) {
			if (typeof field?.name === 'string') yield field.name
			if (typeof field?.value === 'string') yield field.value
			if (typeof field?.rawName === 'string') yield field.rawName
			if (typeof field?.rawValue === 'string') yield field.rawValue
		}
	}
}

function pump() {
	if (running || !active || !actions) return
	const id = queue.shift()
	if (!id) return
	running = true
	Promise.resolve(actions.getUser(id))
		.catch(() => failed.add(id))
		.then(() => redraw(id))
		.finally(() => {
			running = false
			setTimeout(pump, RequestGapMs)
		})
}

/** Re-dispatches the stored message so Discord draws the now known user. */
function redraw(id: string) {
	const targets = waiting.get(id)
	waiting.delete(id)
	if (!active || !targets || !isKnown(id)) return
	for (const [messageId, channelId] of targets) {
		const message = (Stores.MessageStore as any)?.getMessage?.(channelId, messageId)
		if (!message) continue
		Dispatcher.dispatch({
			type: 'MESSAGE_UPDATE',
			message: {
				id: message.id,
				channel_id: message.channel_id ?? channelId,
				content: message.content,
				embeds: message.embeds,
			},
		} as any)
	}
}

function scan(message: any, channelId?: string) {
	if (!message?.id) return
	const channel = message.channel_id ?? channelId
	if (!channel) return

	const sources = [message]
	for (const snapshot of message.message_snapshots ?? [])
		if (snapshot?.message) sources.push(snapshot.message)

	for (const source of sources)
		for (const text of texts(source))
			for (const match of text.matchAll(MentionPattern)) {
				const id = match[1]
				if (isKnown(id) || failed.has(id)) continue
				let targets = waiting.get(id)
				if (!targets) {
					if (queue.length >= MaxQueue) continue
					targets = new Map()
					waiting.set(id, targets)
					queue.push(id)
				}
				targets.set(message.id, channel)
			}
	pump()
}

const SingleMessageEvents = ['MESSAGE_CREATE', 'MESSAGE_UPDATE'] as const

const MessageListEvents = [
	'LOAD_MESSAGES_SUCCESS',
	'LOAD_MESSAGES_AROUND_SUCCESS',
	'LOAD_PINNED_MESSAGES_SUCCESS',
	'LOAD_RECENT_MENTIONS_SUCCESS',
] as const

export default plugin({
	start({ cleanup }) {
		active = true
		cleanup(() => {
			active = false
			queue.length = 0
			waiting.clear()
		})

		cleanup(
			getModules(withProps<UserActions>('getUser', 'fetchCurrentUser'), found => {
				actions = found
				pump()
			}),
		)

		for (const type of SingleMessageEvents)
			cleanup(
				onFluxEventDispatched<{ message?: any }>(type, payload => {
					try {
						scan(payload.message)
					} catch (error) {
						console.warn(`${Tag} ${type} scan failed:`, String(error))
					}
					return payload
				}),
			)

		for (const type of MessageListEvents)
			cleanup(
				onFluxEventDispatched<{ messages?: any[]; channelId?: string }>(
					type,
					payload => {
						try {
							if (Array.isArray(payload.messages))
								for (const message of payload.messages)
									scan(message, payload.channelId)
						} catch (error) {
							console.warn(`${Tag} ${type} scan failed:`, String(error))
						}
						return payload
					},
				),
			)
	},
})
