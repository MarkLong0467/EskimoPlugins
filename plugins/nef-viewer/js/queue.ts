import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { isRawAttachment } from './attachments'
import { MAX_CONCURRENT, TAG } from './constants'
import { convert, previews } from './convert'
import type { Attachment, MessageStore } from './types'

/**
 * The conversion queue.
 *
 * RAW attachments that have no preview yet are queued here. At most `MAX_CONCURRENT` are converted at a time. When
 * one is done, the message that holds it is sent through Discord again so the finished preview replaces the file.
 *
 * State lives at module level because there is only ever one running copy of the plugin.
 */

/** True between `start` and `stop`. Late results are dropped once it is false. */
let active = false

/** Attachments that are queued or being converted, mapped to the message that holds them. */
const pending = new Map<string, { channelId: string; messageId: string }>()

/** Attachments that could not be converted. They are not tried again until Discord reloads. */
const failed = new Set<string>()

/** Attachments waiting for a free conversion slot, oldest first. */
const queue: Array<{ id: string; url: string; filename: string }> = []

/** How many conversions are running now. */
let running = 0

/** Turns the queue on. The returned function turns it off and drops everything that was waiting. */
export function startQueue(): () => void {
	active = true
	return () => {
		active = false
		queue.length = 0
	}
}

/**
 * Queues the conversion of a RAW attachment and starts it if a slot is free.
 * Attachments that already failed, or are already queued, are skipped.
 */
export function schedule(
	attachment: Attachment,
	channelId: string,
	messageId: string,
): void {
	const { id } = attachment
	if (failed.has(id) || pending.has(id)) return

	pending.set(id, { channelId, messageId })
	queue.push({ id, url: attachment.url, filename: attachment.filename })
	pump()
}

/** Starts conversions until every slot is busy or the queue is empty. Each finished one starts the next. */
function pump(): void {
	while (active && running < MAX_CONCURRENT && queue.length) {
		// Safe: the loop condition checked that the queue has an item.
		const { id, url, filename } = queue.shift() as {
			id: string
			url: string
			filename: string
		}
		running++

		convert(id, url, filename)
			.then(() => refreshMessage(id))
			.catch(error => {
				failed.add(id)
				console.warn(`${TAG} Failed to convert ${id}:`, String(error))
			})
			.finally(() => {
				pending.delete(id)
				running--
				pump()
			})
	}
}

/**
 * Sends the stored message through Discord again. The event handlers in `index.ts` see it, find the preview that now
 * exists and swap the attachment, so Discord draws the photo.
 */
function refreshMessage(attachmentId: string): void {
	const target = pending.get(attachmentId)
	if (!active || !target) return

	// `Stores` is typed loosely (every store is `Store<object>`), so the one method used here is described locally.
	const messages = Stores.MessageStore as unknown as MessageStore | undefined
	const message = messages?.getMessage?.(target.channelId, target.messageId)
	if (!message?.attachments) return

	Dispatcher.dispatch({
		type: 'MESSAGE_UPDATE',
		message: {
			id: message.id,
			channel_id: message.channel_id,
			attachments: message.attachments,
		},
	} as never)
}

/**
 * Renders the RAW files of one message now, whatever the "render only when I ask" setting says.
 *
 * @returns How many files were queued: those of the message that have no photo yet and did not fail before.
 */
export function renderMessage(channelId: string, messageId: string): number {
	const messages = Stores.MessageStore as unknown as MessageStore | undefined
	const message = messages?.getMessage?.(channelId, messageId)
	let queued = 0
	for (const attachment of message?.attachments ?? []) {
		if (
			!isRawAttachment(attachment) ||
			previews.has(attachment.id) ||
			pending.has(attachment.id)
		)
			continue
		failed.delete(attachment.id)
		schedule(attachment, channelId, messageId)
		queued++
	}
	return queued
}

/** Whether a message has RAW files that are still files (not rendered yet). */
export function hasUnrenderedRaw(
	channelId: string,
	messageId: string,
): boolean {
	const messages = Stores.MessageStore as unknown as MessageStore | undefined
	const message = messages?.getMessage?.(channelId, messageId)
	return !!message?.attachments?.some(
		attachment => isRawAttachment(attachment) && !previews.has(attachment.id),
	)
}
