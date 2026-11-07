import { beforeJSX } from '@valenced/react/jsx-runtime'
import { openToast } from '../../../shared/kmmiio/toast'
import { installJsxFinder } from '../../../shared/palmdevs/jsxFind'
import {
	copyText,
	insertText,
	openChannelId,
	sendText,
	setChatBox,
} from './deliver'
import { diag } from './diag'
import { openPopup } from './Popup'
import { state } from './state'
import { addRecent, setting } from './store'
import { compose, isStyle, readTime } from './time'
import type { RunInfo } from './command'
import type { ChatBoxRef } from './deliver'

type Cleanup = (...fns: Array<() => unknown>) => unknown

const TOAST_KEY = 'MARKLONG_TIMESTAMP_MAKER_RUN'

/**
 * What `/timestamp` does. It opens the popup, with the time and style it was given filled in. If the settings say to skip the
 * popup when a time is given, it makes the timestamp straight away the way the main button would.
 */
export function runCommand(info: RunInfo): void {
	const channelId = info.channelId ?? openChannelId()
	if (info.when && setting('skipPopup')) {
		const moment = readTime(info.when, Date.now(), {
			zone: setting('zone'),
			order: setting('order'),
			rollForward: setting('rollForward'),
		})
		if (moment !== undefined) {
			const style = isStyle(info.style) ? info.style : setting('style')
			const text = compose(moment, {
				style,
				alsoRelative: setting('alsoRelative'),
				code: setting('code'),
				message: setting('message'),
			})
			const action = setting('action')
			const ok =
				action === 'send'
					? sendText(channelId, text)
					: action === 'insert'
						? insertText(channelId, text) !== undefined
						: copyText(text)
			if (ok) {
				addRecent(moment, style)
				openToast(
					TOAST_KEY,
					action === 'send'
						? 'Timestamp sent'
						: action === 'insert'
							? 'Added to your message'
							: 'Copied',
				)
				return
			}
		}
		// Words that cannot be read, or a delivery that failed, fall through to the popup so nothing is lost.
	}
	openPopup({ channelId, when: info.when, style: info.style })
}

/**
 * Finds Discord's chat input so a timestamp can be put into the message being written.
 *
 * @param cleanup Where to register what undoes it.
 */
export function installChatBox(cleanup: Cleanup): void {
	const hooked = new WeakSet<object>()
	state.jsx = installJsxFinder(cleanup, [
		{
			name: 'ChatInputAppCommandManager',
			seen(type) {
				if (!type || (typeof type !== 'object' && typeof type !== 'function'))
					return
				if (hooked.has(type as object)) return
				hooked.add(type as object)
				diag.log('found', 'Found the chat input')
				cleanup(
					beforeJSX(type as never, (args: unknown[]) => {
						const props = args[1] as { chatInputRef?: ChatBoxRef } | undefined
						setChatBox(props?.chatInputRef)
						return args as never
					}) as never,
				)
			},
		},
	])
}
