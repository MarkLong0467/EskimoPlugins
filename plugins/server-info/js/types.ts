/** A server, as Discord's guild store keeps it. Only the fields the plugin reads are listed. */
export interface Guild {
	id?: string
	name?: string
	description?: string | null
	icon?: string | null
	banner?: string | null
	ownerId?: string | null
	vanityURLCode?: string | null
	premiumTier?: number
	premiumSubscriberCount?: number
	memberCount?: number | null
	approximateMemberCount?: number | null
	/** What the server is: a Set in Discord's store, but a list is read too. */
	features?: Set<string> | string[]
	verificationLevel?: number
	preferredLocale?: string
}

/** A user, as Discord's user store keeps it. */
export interface User {
	id?: string
	username?: string
	globalName?: string | null
	avatar?: string | null
}

/** A friend who is in the server, with the names the sheet can show for them. */
export interface Friend {
	id: string
	username: string | null
	globalName: string | null
	/** The name the friend uses in this server. */
	nick: string | null
}

/** The owner of a server, remembered so the sheet does not have to ask again. */
export interface CachedOwner {
	id: string
	name: string | null
	/** The name that starts with @. */
	username?: string | null
	avatar: string | null
}

/** A store that tells when it changes. */
export interface ChangeStore {
	addChangeListener?(listener: () => void): void
	removeChangeListener?(listener: () => void): void
}

/** The stores the plugin reads, described only as far as it uses them. */
export interface GuildStore extends ChangeStore {
	getGuild?(guildId: string): Guild | undefined
}
export interface UserStore extends ChangeStore {
	getUser(userId: string): User | undefined
}
export interface RoleStore extends ChangeStore {
	getSortedRoles?(guildId: string): unknown[] | undefined
}
export interface ChannelStore extends ChangeStore {
	getChannels?(guildId: string): Record<string, unknown> | undefined
}
export interface MemberStore {
	getSelfMemberJoinedAt?(
		guildId: string,
	): Date | number | string | null | undefined
	getSelfMember?(
		guildId: string,
	): { joinedAt?: Date | number | string | null } | undefined
	getMembers?(
		guildId: string,
	): Record<string, { nick?: string | null }> | undefined
	getMember?(
		guildId: string,
		userId: string,
	): { nick?: string | null } | undefined
	getMemberIds?(guildId: string): string[] | undefined
}
export interface CountStore extends ChangeStore {
	getMemberCount?(guildId: string): number | null | undefined
	getOnlineCount?(guildId: string): number | null | undefined
}
export interface RelationshipStore {
	getFriendIDs?(): string[]
}

/** Discord's connection to its web API, as far as the plugin uses it. */
export interface Rest {
	get?(options: {
		url: string
		query?: Record<string, unknown>
	}): Promise<{ body?: Record<string, unknown> } | undefined>
}

/** Something that has a function with a given name, such as a module of Discord's actions. */
export type Actions<Name extends string> = {
	[K in Name]?: (...args: unknown[]) => unknown
}

/** One item of the server menu. Discord adds more fields than are listed. */
export interface MenuItem {
	label?: string
	action?: () => unknown
	iconSource?: unknown
	IconComponent?: unknown
	[field: string]: unknown
}

/** The store of emojis. */
export interface EmojiStore {
	getGuildEmoji?(guildId: string): unknown[] | undefined
}
/** The store of stickers. */
export interface StickersStore {
	getStickersByGuildId?(guildId: string): unknown[] | undefined
}
/** The store of who is online. */
export interface PresenceStore extends ChangeStore {
	getStatus?(userId: string): string | undefined
}
