import { Stores } from '@valenced/discord/flux'
import { DM, GROUP_DM } from './constants'
import type { Channel, Guild, ListEntry, PluginStores, User } from './types'

/** Discord's stores, described as far as the plugin uses them. */
const stores = () => Stores as unknown as PluginStores

/** A chat or channel by id, or nothing if it is not known. */
export function getChannel(id: string): Channel | null | undefined {
	try {
		return stores().ChannelStore.getChannel(id)
	} catch {
		return null
	}
}

/** A server by id, or nothing if it is not known. */
export function getGuild(id: string): Guild | null | undefined {
	try {
		return stores().GuildStore.getGuild(id)
	} catch {
		return null
	}
}

/** A user by id, or nothing if Discord has not seen them. */
export function getUser(id: string): User | null | undefined {
	try {
		return stores().UserStore.getUser(id)
	} catch {
		return null
	}
}

/** Whether a channel is a direct message or a group chat. */
export const isDirectMessage = (channel: Channel | null | undefined): boolean =>
	!!channel && (channel.type === DM || channel.type === GROUP_DM)

/** The id of the account that is signed in. */
export function myId(): string | undefined {
	try {
		return stores().UserStore.getCurrentUser().id
	} catch {
		return undefined
	}
}

/** The account's status now: `online`, `idle`, `dnd` or `invisible`. */
export function myStatus(): string | undefined {
	try {
		return stores().SelfPresenceStore.getStatus()
	} catch {
		return undefined
	}
}

/** The id of the channel that is open. */
export function viewedChannelId(): string | undefined {
	try {
		return stores().SelectedChannelStore.getChannelId()
	} catch {
		return undefined
	}
}

/** A person's name for the settings: the display name, else the username, else the end of the id. */
export function userLabel(id: string): string {
	const user = getUser(id)
	return user
		? user.globalName ||
				user.global_name ||
				user.username ||
				`User ${String(id).slice(-4)}`
		: `User ${String(id).slice(-4)}`
}

/** A server's name for the settings. */
export function guildLabel(id: string): string {
	const guild = getGuild(id)
	return guild
		? guild.name || `Server ${String(id).slice(-4)}`
		: `Server ${String(id).slice(-4)}`
}

/** A chat or channel's name for the settings: `#general · My Server`, a group chat's name or its members. */
export function channelLabel(id: string): string {
	const channel = getChannel(id)
	if (!channel) return `Chat ${String(id).slice(-4)}`
	if (!isDirectMessage(channel)) {
		const guild = channel.guild_id ? getGuild(channel.guild_id) : null
		return `#${channel.name || 'channel'}${guild ? ` · ${guild.name}` : ''}`
	}
	if (channel.name) return channel.name
	const recipients = (channel.recipients || []).map(r =>
		typeof r === 'string' ? r : r?.id,
	)
	return (
		recipients.map(id => userLabel(id as string)).join(', ') || 'Direct message'
	)
}

/** The ids of all direct messages and group chats. */
export function allDirectMessageIds(): string[] {
	try {
		return stores()
			.PrivateChannelSortStore.getPrivateChannelIds()
			.filter((id): id is string => typeof id === 'string')
	} catch {
		return []
	}
}

/** All the servers the account is in. */
export function allGuilds(): Guild[] {
	try {
		const guilds = stores().GuildStore.getGuilds() || {}
		return Object.keys(guilds)
			.map(id => guilds[id])
			.filter(guild => guild?.id)
	} catch {
		return []
	}
}

/**
 * What to put on the list for a chat. A one-to-one chat is saved as the person (so they also count in group chats).
 * Any other chat is saved as itself.
 */
export function listEntryForChat(channelId: string): ListEntry {
	const channel = getChannel(channelId)
	const other =
		channel &&
		channel.type === DM &&
		channel.recipients &&
		channel.recipients[0]
	const userId = typeof other === 'string' ? other : other && other.id
	return userId
		? { kind: 'users', id: userId }
		: { kind: 'channels', id: channelId }
}
