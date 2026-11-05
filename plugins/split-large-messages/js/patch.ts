import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { maxMessageLength } from './limit'
import { splitMessage } from './split'
import type { MessageActions, SendOptions } from './types'

/**
 * Replaces Discord's `sendMessage` so that a message over the length limit is sent as several messages.
 *
 * Discord's message module is found with `getModules`, which reports modules that are already loaded as well as ones
 * that load later. A one-time lookup could miss it, because Discord loads many modules only when a screen needs them.
 *
 * @param cleanup Registers a function to run when the plugin stops. Both the module subscription and the patch are
 * undone through it.
 */
export function patchSendMessage(
	cleanup: (...fns: Array<() => unknown>) => void,
): void {
	cleanup(
		getModules(
			withProps<MessageActions>('sendMessage', 'receiveMessage'),
			messages => {
				cleanup(
					instead(messages, 'sendMessage', function (args, original) {
						const [channelId, message, clearDraft, options] = args
						const limit = maxMessageLength()

						// Messages inside the limit, and messages without text, are sent exactly as Discord would.
						if (
							typeof message?.content !== 'string' ||
							message.content.length <= limit
						) {
							return Reflect.apply(original, this, args)
						}

						const parts = splitMessage(message.content, limit)

						// Split the options between the messages:
						// - the reply (and everything else) stays on the first message,
						// - the files are uploaded with the last message, so they appear after all of the text.
						const {
							attachmentsToUpload,
							onAttachmentUploadError,
							...firstOptions
						} = (options ?? {}) as SendOptions
						const lastOptions = attachmentsToUpload
							? { attachmentsToUpload, onAttachmentUploadError }
							: {}

						// The first message keeps Discord's own nonce and sends no files.
						let sent: Promise<unknown> = Promise.resolve(
							Reflect.apply(original, this, [
								channelId,
								{ ...message, content: parts[0] },
								clearDraft,
								{ ...firstOptions, attachmentsToUpload: [] },
							]),
						)

						// The rest are chained, so they arrive in order. Each message needs its own nonce, so the copied
						// one is dropped and Discord makes a new one.
						parts.slice(1).forEach((content, index, rest) => {
							sent = sent.then(() => {
								const { nonce: _nonce, ...base } = message
								return Reflect.apply(original, this, [
									channelId,
									{ ...base, content },
									clearDraft,
									index === rest.length - 1 ? lastOptions : {},
								])
							})
						})

						// Resolves with the result of the last message, like a single send would.
						return sent
					}),
				)
			},
		),
	)
}
