import { Stores } from '@valenced/discord/flux'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { resolveSheet } from '../../../shared/kmmiio/lib/sheets'
import { openToast } from '../../../shared/kmmiio/toast'
import type { SheetSpec } from '../../../shared/kmmiio/lib/sheets'

/** Names this plugin's toasts, so a new one replaces the one that is up. */
const TOAST_KEY = 'MARKLONG_I_REMEMBER_YOU'

/** A Discord user, as far as this plugin reads one. */
export interface User {
	id: string
	username: string
	discriminator?: string
	tag?: string
	bot?: boolean
	getAvatarURL?(...args: unknown[]): string | undefined
}

/** A Discord server, as far as this plugin reads one. */
export interface Guild {
	id: string
	name: string
	ownerId?: string
}

/** The stores this plugin reads. */
interface DiscordStores {
	ChannelStore?: {
		getChannel(id: string): { guild_id?: string | null } | undefined
		getDMUserIds?(): string[]
		getSortedPrivateChannels?(): {
			id: string
			type: number
			name?: string
			recipients?: string[]
		}[]
	}
	RelationshipStore?: { getFriendIDs(): string[] }
	GuildStore?: {
		getGuild(id: string | null | undefined): Guild | undefined
		getGuilds(): Record<string, Guild>
	}
	GuildMemberStore?: { getMembers(guildId: string): { userId: string }[] | undefined }
	MessageStore?: {
		getMessage(channelId: string, messageId: string): { author?: User } | undefined
	}
	UserStore?: {
		getUser(id: string | undefined): User | undefined
		getCurrentUser(): User | undefined
	}
}

/** Discord's stores. A store Discord does not have is undefined. */
export const stores = () => Stores as unknown as DiscordStores

/** The first Discord module that has all the given properties. */
export function findByProps<T>(...props: string[]): T | undefined {
	return lookupModule(
		(withProps as (...names: string[]) => ReturnType<typeof withProps>)(
			...props,
		),
	)[0] as unknown as T | undefined
}

/** Shows a toast. */
export const toast = (text: string) => openToast(TOAST_KEY, text)

/** Copies text and says so with a toast, as Equicord's `copyWithToast` does. */
export function copyWithToast(text: string, said: string): void {
	try {
		Clipboard.setString(text)
		toast(said)
	} catch {
		// Nothing was copied, so nothing is announced.
	}
}

/** Discord's profile sheet, found through the code it calls into (it loads only when a profile is first opened). */
const PROFILE_SHEET: SheetSpec = {
	prop: ['showUserProfileActionSheetPostConnection', 'getUserProfileActionSheetKey'],
	anchor: 'openLazy',
}

/** Opens a user's profile, as Equicord's `openUserProfile` does. A toast says so when it cannot be opened. */
export function openUserProfile(userId: string): void {
	const args = { userId }
	let opener: unknown
	try {
		opener = resolveSheet(PROFILE_SHEET)
	} catch {
		// Tried by the older ways.
	}
	const sheet = findByProps<unknown>(
		'USER_PROFILE_ACTION_SHEET_KEY_PREFIX',
		'getUserProfileActionSheetKey',
	)
	const tries: unknown[] = [
		opener,
		typeof sheet === 'function'
			? sheet
			: (sheet as { default?: unknown } | undefined)?.default,
	]
	for (const name of ['openUserProfile', 'openUserProfileModal', 'showUserProfile'])
		tries.push(findByProps<Record<string, unknown>>(name)?.[name])
	for (const open of tries) {
		if (typeof open !== 'function') continue
		try {
			;(open as (args: unknown) => void)(args)
			return
		} catch {
			// Try the next way.
		}
	}
	toast("Couldn't open this profile.")
}
