import { Dispatcher } from '@valenced/discord/common/flux'
import { onImportedPath } from './modules'
import {
	clearPendingLocalEditForChannel,
	consumePendingLocalEdit,
	markLocalEdit,
	setPendingLocalEdit,
} from './state'

let messageActionCreators: any
let messageStore: any

export function patchEditing(): () => void {
	const unpatch: Array<() => void> = []

	const unsubActions = onImportedPath(
		'actions/MessageActionCreators.tsx',
		(ns: any) => {
			messageActionCreators = ns?.default ?? ns
			if (messageActionCreators?.editMessage) {
				unpatch.push(
					valenced.patcher.instead(
						messageActionCreators,
						'editMessage',
						(args: any[], original: any) => {
							const channelId = args[0]
							const messageId = args[1]
							const parsed = args[2]
							if (consumePendingLocalEdit(channelId, messageId)) {
								const text =
									typeof parsed?.content === 'string' ? parsed.content : ''
								// Local ghost edit: markLocalEdit() keeps it out of the
								// sender's trail. Update the store by dispatching
								// MESSAGE_UPDATE ourselves -- no server round trip.
								markLocalEdit(channelId, messageId)
								// Store the new content so the row renders it; the edit
								// trail keeps the old version.
								const msg = messageStore?.getMessage?.(channelId, messageId)
								if (msg != null) {
									Dispatcher.dispatch({
										type: 'MESSAGE_UPDATE',
										message: {
											...msg,
											id: messageId,
											channel_id: channelId,
											content: text,
											edited_timestamp: null,
										},
									})
								}
								return undefined
							}
							return original(...args)
						},
					),
				)
			}
		},
	)
	unpatch.push(unsubActions)

	const unsubStore = onImportedPath('stores/MessageStore.tsx', (ns: any) => {
		messageStore = ns?.default ?? ns
	})
	unpatch.push(unsubStore)

	const onEndEdit = (payload: any) => {
		if (payload?.channelId) {
			clearPendingLocalEditForChannel(payload.channelId)
		}
	}
	try {
		Dispatcher.subscribe('MESSAGE_END_EDIT', onEndEdit)
		unpatch.push(() => {
			try {
				Dispatcher.unsubscribe('MESSAGE_END_EDIT', onEndEdit)
			} catch {}
		})
	} catch {}

	return () => {
		for (const un of unpatch) un?.()
	}
}

export function startLocalEdit(
	channelId: string,
	message: any,
	source = 'action_sheet',
) {
	if (typeof channelId !== 'string' || !message?.id) {
		return
	}
	setPendingLocalEdit(channelId, message.id)
	// The store record already holds the latest content (local edits live in it).
	const content =
		messageStore?.getMessage?.(channelId, message.id)?.content ??
		message.content
	messageActionCreators?.startEditMessage?.(
		channelId,
		message.id,
		content,
		source,
	)
}
