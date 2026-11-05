import { Dispatcher } from '@valenced/discord/common/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { Vibration } from 'react-native'
import { redrawSettings, setting } from './config'
import { SILENT_MESSAGE_FLAG } from './constants'
import {
	getChannel,
	isDirectMessage,
	myId,
	myStatus,
	userLabel,
	viewedChannelId,
} from './discord'
import { mayBypass } from './rule'
import { banners, hooks } from './state'
import { toast } from './toast'
import type { Message, MessageEvent } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** The part of a Flux dispatcher that is patched. */
interface Dispatching {
	dispatch: (...args: unknown[]) => unknown
}

/** Discord's Flux dispatcher: the one the common modules give, or else any module that looks like one. */
function findDispatcher(): Dispatching | null {
	const known = Dispatcher as unknown as Dispatching | undefined
	if (known && typeof known.dispatch === 'function') return known
	const found = lookupModule(
		withProps('dispatch', 'subscribe', 'unsubscribe'),
	)[0] as unknown as Dispatching | undefined
	return found && typeof found.dispatch === 'function' ? found : null
}

/** "Anna: hello" or "Anna in #general: hello", with mentions turned into names. */
function describeMessage(message: Message): string {
	const author =
		message.author?.global_name || message.author?.username || 'Someone'
	const channel = getChannel(message.channel_id as string)
	const place =
		channel && !isDirectMessage(channel)
			? ` in #${channel.name || 'channel'}`
			: ''
	const text = String(message.content || '')
		.replace(/<@!?(\d{15,})>/g, (_, id: string) => `@${userLabel(id)}`)
		.replace(
			/<#(\d{15,})>/g,
			(_, id: string) => `#${getChannel(id)?.name || 'channel'}`,
		)
		.replace(/\s+/g, ' ')
		.trim()
	return `${author}${place}: ${text || '[attachment]'}`.slice(0, 160)
}

/** Whether the plugin's own banner should show for this event: a new message from someone allowed, in another chat, while on Do Not Disturb. */
function ownBannerWanted(event: MessageEvent | undefined): boolean {
	const message = event?.message
	if (
		!event ||
		event.type !== 'MESSAGE_CREATE' ||
		!message ||
		event.optimistic ||
		!message.author
	)
		return false
	if (message.author.id === myId() || message.channel_id === viewedChannelId())
		return false
	if (!message.content && !message.attachments?.length) return false
	if ((message.flags ?? 0) & SILENT_MESSAGE_FLAG) return false
	return myStatus() === 'dnd' && mayBypass(message, message.channel_id)
}

/** Shows the plugin's own banner (a toast) for a message, with one buzz if the setting asks for it. */
function showOwnBanner(message: Message): void {
	banners.shown += 1
	toast(describeMessage(message))
	if (setting('ownBannerBuzz')) {
		try {
			Vibration.vibrate(200)
		} catch {
			// No vibration on this phone.
		}
	}
	redrawSettings()
}

/**
 * Shows a banner of the plugin's own for new messages that may bypass Do Not Disturb.
 *
 * It listens by wrapping the dispatcher's `dispatch`. It is used when the setting asks for it, and always when Discord's
 * own notification function was not found. The message goes through Discord's dispatch first, and the banner follows,
 * even if Discord throws.
 */
export function listenForOwnBanner(cleanup: Cleanup): void {
	const dispatcher = findDispatcher()
	if (!dispatcher) return
	cleanup(
		instead(dispatcher, 'dispatch', function (args, original) {
			const event = args?.[0] as MessageEvent | undefined
			const wanted =
				(setting('ownBanner') || hooks.notificationUtils !== 'found') &&
				ownBannerWanted(event)
			try {
				return Reflect.apply(original, this, args)
			} finally {
				if (wanted) showOwnBanner((event as MessageEvent).message as Message)
			}
		}),
	)
	hooks.patched.push('Dispatcher.dispatch (own banner)')
}
