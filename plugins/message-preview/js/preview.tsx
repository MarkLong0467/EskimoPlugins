import {
	AlertActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Dispatcher } from '@valenced/discord/common/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { countUploads, getAttachments } from './attachments'
import { setting } from './config'
import { ALERT_KEY, EPHEMERAL_FLAG, TOAST_KEY } from './constants'
import { findByProps, store } from './discord'
import PreviewAlert from './PreviewAlert'
import type {
	BotMessages,
	ChatItemComponent,
	MessageActions,
	MessageRecordClass,
	PreviewAttachment,
	PreviewMessage,
	RowManagerClass,
} from './types'

/** The reason the last preview in a message could not be shown, to put in the toast. */
let failure: string | undefined

/**
 * Builds the message that is shown. Discord's own `createBotMessage` is used so it looks like a real message; if that
 * is not available, a plain message with the same fields is made. Either way it carries the given author and files.
 */
function buildMessage(
	channelId: string,
	content: string,
	attachments: PreviewAttachment[],
	author: unknown,
): PreviewMessage {
	let message: PreviewMessage | undefined
	try {
		message = findByProps<BotMessages>('createBotMessage')?.createBotMessage({
			channelId,
			content,
		})
	} catch {
		// Fall back to the plain message below.
	}
	if (!message || typeof message !== 'object') {
		message = {
			id: `${Date.now()}0`,
			type: 0,
			channel_id: channelId,
			content,
			embeds: [],
			mentions: [],
			mention_roles: [],
			mention_everyone: false,
			tts: false,
			pinned: false,
			flags: EPHEMERAL_FLAG,
			timestamp: new Date().toISOString(),
			edited_timestamp: null,
			reactions: [],
			components: [],
			state: 'SENT',
		}
	}
	return Object.assign(message, { author, attachments })
}

/**
 * Shows the message in the chat, to you only, like a message from Clyde.
 *
 * Discord's `receiveMessage` is tried first. If it is not available, a `MESSAGE_CREATE` event is sent instead.
 *
 * @returns Whether the message was shown. When it was not, the reason is kept for the toast.
 */
function previewAsEphemeral(
	channelId: string,
	content: string,
	attachments: PreviewAttachment[],
	author: unknown,
): boolean {
	const message = buildMessage(channelId, content, attachments, author)
	try {
		const actions = findByProps<MessageActions>('receiveMessage')
		if (actions) {
			actions.receiveMessage(channelId, message)
			return true
		}
	} catch {
		// Try the event below.
	}
	try {
		Dispatcher.dispatch({
			type: 'MESSAGE_CREATE',
			channelId,
			message,
			optimistic: false,
			isPushNotification: false,
		} as never)
		return true
	} catch (error) {
		failure = String(
			(error as { message?: unknown } | undefined)?.message || error,
		)
	}
	return false
}

/**
 * Draws the message in a popup, with Discord's own message drawing.
 *
 * @returns Whether the popup was opened. It is not if one of the pieces of Discord's code it needs cannot be found.
 */
function previewAsPopup(
	channelId: string,
	content: string,
	attachments: PreviewAttachment[],
	author: unknown,
): boolean {
	const MessageRecord = lookupModule(withName('MessageRecord'))[0] as unknown as
		| MessageRecordClass
		| undefined
	const RowManager = lookupModule(withName('RowManager'))[0] as unknown as
		| RowManagerClass
		| undefined
	const wrapper = lookupModule(
		withProps('DCDAutoModerationSystemMessageView', 'default'),
	)[0] as { default?: ChatItemComponent } | undefined
	const ChatItem = wrapper?.default
	if (
		typeof MessageRecord !== 'function' ||
		typeof RowManager !== 'function' ||
		!ChatItem
	)
		return false

	const message = new MessageRecord({
		id: '0',
		channel_id: channelId,
		content,
		attachments,
		author,
	})
	AlertActionCreators.openAlert(
		ALERT_KEY,
		<PreviewAlert
			ChatItem={ChatItem}
			rows={new RowManager()}
			message={message}
		/>,
	)
	return true
}

/**
 * Previews what is in the message box.
 *
 * Nothing happens if no channel is open, or the box has no text and no files. The popup is tried first if the setting
 * asks for it; if it cannot be shown (or the setting is the ephemeral message) the message is shown in the chat. If
 * that fails too, a toast says so.
 *
 * @param typed The text from the box when it is known. If not given, the saved draft of the open channel is used.
 */
export async function openPreview(typed?: unknown): Promise<void> {
	const channelId = store<{ getChannelId(): string | undefined }>(
		'SelectedChannelStore',
	)?.getChannelId()
	if (!channelId) return

	const content =
		typeof typed === 'string'
			? typed
			: store<{
					getDraft(channelId: string, type: number): string | undefined
				}>('DraftStore')?.getDraft(channelId, 0) || ''
	if (!content.trim() && !countUploads(channelId)) return

	const author = store<{ getCurrentUser(): unknown }>(
		'UserStore',
	)?.getCurrentUser()
	const attachments = await getAttachments(channelId)

	let shown = false
	try {
		if (setting('previewType') === 'popup')
			shown = previewAsPopup(channelId, content, attachments, author)
	} catch {
		// Fall back to the message in the chat.
	}
	if (shown) return

	let ok = false
	try {
		ok = previewAsEphemeral(channelId, content, attachments, author)
	} catch {
		// The toast below says it did not work.
	}
	if (!ok)
		ToastActionCreators.open(TOAST_KEY, {
			text: `Could not show the preview${failure ? ` (${failure})` : ''}`,
		})
}
