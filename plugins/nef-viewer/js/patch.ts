import { isRawAttachment, toImageAttachment } from './attachments'
import { setting } from './config'
import { previews } from './convert'
import { schedule } from './queue'
import type { DiscordMessage } from './types'

/**
 * Rewrites the RAW attachments of a message, in place, as the message passes through Discord.
 *
 * - A RAW attachment that already has a converted preview is replaced by the photo.
 * - One that has none yet is left as it is and queued for conversion. When the conversion finishes, the message is
 *   sent again and this function swaps it then.
 * - In forwarded messages (snapshots) only finished previews are swapped. Nothing is queued for them, because the
 *   forwarded message has no id of its own to refresh.
 *
 * @param message The message from a Flux event. Nothing happens if it is missing.
 * @param channelId The channel, for events whose messages do not carry `channel_id` themselves.
 */
export function patchMessage(
	message: DiscordMessage | undefined,
	channelId?: string,
): void {
	if (!message || !setting('convertRaw')) return

	const channel = message.channel_id ?? channelId
	const { attachments } = message

	if (Array.isArray(attachments) && attachments.some(isRawAttachment)) {
		message.attachments = attachments.map(attachment => {
			if (!isRawAttachment(attachment)) return attachment
			if (previews.has(attachment.id)) return toImageAttachment(attachment)
			if (channel && message.id && !setting('renderOnDemand'))
				schedule(attachment, channel, message.id)
			return attachment
		})
	}

	// Forwarded messages
	if (Array.isArray(message.message_snapshots)) {
		for (const snapshot of message.message_snapshots) {
			if (!snapshot?.message) continue
			const snapshotAttachments = snapshot.message.attachments
			if (Array.isArray(snapshotAttachments)) {
				snapshot.message.attachments = snapshotAttachments.map(attachment =>
					isRawAttachment(attachment)
						? toImageAttachment(attachment)
						: attachment,
				)
			}
		}
	}
}
