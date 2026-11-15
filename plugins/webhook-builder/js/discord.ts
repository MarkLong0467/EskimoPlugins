import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { Linking } from 'react-native'
import { openToast } from '../../../shared/kmmiio/toast'
import { TOAST_KEY } from './constants'
import type { ComponentType } from 'react'

/** One of Discord's Flux stores by name, described by the type the caller gives. */
function store<T>(name: string): T | undefined {
	try {
		return Stores[name] as unknown as T | undefined
	} catch {
		return undefined
	}
}

/** A channel as Discord's store has it, as far as this plugin uses it. */
export interface ChannelInfo {
	id: string
	name?: string
	guild_id?: string | null
	type?: number
	parent_id?: string | null
}

/** The channel that is open, if any. */
export function currentChannelId(): string | undefined {
	return (
		store<{ getChannelId(): string | undefined }>(
			'SelectedChannelStore',
		)?.getChannelId() ?? undefined
	)
}

/** The server that is open, if any. */
export function currentGuildId(): string | undefined {
	return (
		store<{ getGuildId(): string | null | undefined }>(
			'SelectedGuildStore',
		)?.getGuildId() ?? undefined
	)
}

/** A channel by id. */
export function channel(
	id: string | null | undefined,
): ChannelInfo | undefined {
	if (!id) return undefined
	return store<{ getChannel(id: string): ChannelInfo | undefined }>(
		'ChannelStore',
	)?.getChannel(id)
}

/** A server's name by id. */
export function guildName(id: string | null | undefined): string | undefined {
	if (!id) return undefined
	return store<{ getGuild(id: string): { name?: string } | undefined }>(
		'GuildStore',
	)?.getGuild(id)?.name
}

/** Where a webhook posts, in words: `#general · My Server`. */
export function placeOf(
	channelId: string | null,
	guildId: string | null,
): string {
	const name = channel(channelId)?.name
	const guild = guildName(guildId)
	return [
		name ? `#${name}` : channelId ? 'a channel you cannot see' : '',
		guild,
	]
		.filter(Boolean)
		.join(' · ')
}

/** Shows a toast. */
export function toast(text: string): void {
	openToast(TOAST_KEY, text)
}

/** Puts text on the clipboard. */
export function copy(text: string, what = 'Copied'): void {
	try {
		;(Clipboard as unknown as { setString(value: string): void }).setString(
			text,
		)
		toast(what)
	} catch {
		toast('Could not copy')
	}
}

/** What is on the clipboard. */
export async function paste(): Promise<string> {
	try {
		return String(
			(await (
				Clipboard as unknown as { getString(): Promise<string> }
			).getString()) ?? '',
		)
	} catch {
		return ''
	}
}

/** Opens a link. Discord links open in Discord. */
export function open(url: string): void {
	Linking.openURL(url).catch(() => toast('Could not open the link'))
}

/** Discord's action sheet functions. */
export const sheets = () =>
	ActionSheetActionCreators as unknown as {
		openLazy(importer: unknown, key: string, props?: unknown): unknown
		hideActionSheet(key?: string): void
		hideAllActionSheets(): void
	}

/** Closes every sheet that is open. */
export function hideSheets(): void {
	try {
		sheets().hideAllActionSheets()
	} catch {
		// No sheet was open.
	}
}

/** Opens a sheet with a component in it, once the sheet that is open has closed. */
export function openSheet(key: string, render: () => unknown): void {
	hideSheets()
	setTimeout(() => {
		try {
			sheets().openLazy(Promise.resolve({ default: render }), key, {})
		} catch {
			toast('Could not open the sheet')
		}
	}, 0)
}

/** One of Discord's icons, by the name of its component. */
export function iconComponent(name: string): ComponentType | undefined {
	try {
		const icon = (
			lookupModule(withProps(name))[0] as Record<string, unknown> | undefined
		)?.[name]
		return typeof icon === 'function' || (icon && typeof icon === 'object')
			? (icon as ComponentType)
			: undefined
	} catch {
		return undefined
	}
}

/** The id of one of Discord's icons by name, or nothing if there is no such icon. */
export function asset(name: string): number | undefined {
	const id = getAssetIdByName(name)
	return id == null ? undefined : id
}

/** The icon of the row in the message menu. */
export const MENU_ICON = 'WebhookIcon'
export const MENU_ICON_FALLBACK = 'LinkIcon'
