import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { splitMessage } from './split'

interface MessageActions {
	sendMessage(
		channelId: string,
		message: { content: string; nonce?: string },
		clearDraft: boolean,
		options?: object,
	): Promise<unknown> | undefined
	receiveMessage: unknown
}

/** 4000 characters with Nitro (premiumType 1 or 2), 2000 otherwise. */
function maxLength(): number {
	const type = Stores.UserStore?.getCurrentUser?.()?.premiumType
	return type === 1 || type === 2 ? 4000 : 2000
}

export default plugin({
	start({ cleanup }) {
		cleanup(
			getModules(
				withProps<MessageActions>('sendMessage', 'receiveMessage'),
				messages => {
					cleanup(
						instead(messages, 'sendMessage', function (args, original) {
							const [channelId, message, clearDraft, options] = args
							const limit = maxLength()
							if (typeof message?.content !== 'string' || message.content.length <= limit)
								return Reflect.apply(original, this, args)

							const parts = splitMessage(message.content, limit)
							// Attachments and replies stay on the first message. The nonce must be unique per message.
							let sent: Promise<unknown> = Promise.resolve(
								Reflect.apply(original, this, [
									channelId,
									{ ...message, content: parts[0] },
									clearDraft,
									options,
								]),
							)
							for (const content of parts.slice(1)) {
								sent = sent.then(() => {
									const { nonce: _nonce, ...rest } = message
									return Reflect.apply(original, this, [
										channelId,
										{ ...rest, content },
										clearDraft,
										{},
									])
								})
							}
							return sent
						}),
					)
				},
			),
		)
	},
})
