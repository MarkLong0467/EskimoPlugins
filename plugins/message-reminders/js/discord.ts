import { getAssetIdByName } from '@valenced/assets'
import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { Linking } from 'react-native'
import { TOAST_KEY } from './constants'
import type { Reminder } from './types'

/** One of Discord's Flux stores by name, described by the type the caller gives. Nothing if Discord has no such store. */
export function store<T>(name: string): T | undefined {
	return Stores[name] as unknown as T | undefined
}

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text })
	} catch {
		// Toasts are a convenience.
	}
}

/** The id of one of Discord's icons by name, or nothing if there is no such icon. */
export function asset(name: string): number | undefined {
	const id = getAssetIdByName(name)
	return id == null ? undefined : id
}

/** Discord's action sheet functions (open and close the bottom sheets). */
export const sheets = () => ActionSheetActionCreators

/** The server a channel is in, or `null` for a direct message or a channel that is not known. */
export function guildOf(channelId: string): string | null {
	const channel = store<{
		getChannel(id: string): { guild_id?: string | null } | undefined
	}>('ChannelStore')?.getChannel(channelId)
	return channel?.guild_id ?? null
}

/** The link that opens a message in Discord, which also jumps to it. */
export function messageLink(
	reminder: Pick<Reminder, 'guildId' | 'channelId' | 'messageId'>,
): string {
	return `https://discord.com/channels/${reminder.guildId ?? '@me'}/${reminder.channelId}/${reminder.messageId}`
}

/** Opens the message of a reminder in Discord. Returns whether the phone took the link. */
export async function jumpTo(reminder: Reminder): Promise<boolean> {
	try {
		await Linking.openURL(messageLink(reminder))
		return true
	} catch {
		return false
	}
}
