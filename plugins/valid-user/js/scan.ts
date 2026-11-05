import { MENTION_PATTERN } from './constants'
import { enqueue, pump } from './lookup'
import { texts } from './texts'
import type { DiscordMessage } from './types'

/**
 * Looks through a message for mentions of unknown users and queues a lookup for each one.
 *
 * Forwarded messages keep their content in a snapshot, so those are searched as well.
 *
 * @param message The message from a Flux event.
 * @param channelId The channel, for events whose messages do not carry `channel_id` themselves.
 */
export function scanMessage(
	message: DiscordMessage | undefined,
	channelId?: string,
): void {
	if (!message?.id) return
	const channel = message.channel_id ?? channelId
	if (!channel) return

	const sources = [message]
	for (const snapshot of message.message_snapshots ?? []) {
		if (snapshot?.message) sources.push(snapshot.message)
	}

	for (const source of sources) {
		for (const text of texts(source)) {
			for (const match of text.matchAll(MENTION_PATTERN))
				enqueue(match[1], message.id, channel)
		}
	}

	pump()
}
