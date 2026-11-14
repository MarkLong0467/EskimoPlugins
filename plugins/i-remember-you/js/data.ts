/**
 * Who is remembered, and how they are found. A port of `components/data.tsx` of IRememberYou for Equicord: the same
 * collection, filled at the same moments, saved every three minutes.
 */

import { store } from './config'
import { diag } from './diag'
import { stores } from './discord'
import type { Guild, User } from './discord'

export interface IUserExtra {
	isOwner?: boolean
	updatedAt?: number
}

export interface IStorageUser {
	id: string
	username: string
	tag: string
	iconURL?: string
	extra?: IUserExtra
}

export interface GroupData {
	id: string
	users: { [key: string]: IStorageUser }
	name: string
	inviteLink?: string
}

/** Everyone remembered, by the id of the server they were met in (`dm` outside a server). */
export type UsersCollection = Record<string, GroupData>

/** Someone to remember, where they were met, and what is known about them. */
interface Entry {
	user: User
	source?: Guild
	extra?: IUserExtra
}

/** A reply, as Discord passes it with a message that is sent. */
interface ReplyOptions {
	messageReference?: { channel_id: string; message_id: string }
}

/** How often the collection is saved: every three minutes, as in Equicord. */
const AUTOSAVE_MS = 60_000 * 3

/** The most members of one of your own servers that are remembered at the start. */
const LIMIT = 1_000

/** The group your friends are kept in. */
export const FRIENDS: Guild = { id: 'friends', name: 'Friends' }

/** A group DM's channel type, and what its group's key starts with (so it is not taken for a server). */
const GROUP_DM = 3
export const GROUP_PREFIX = 'gdm:'

/** Whether a group of the collection is a server (and so has a server ID to copy). */
export const isGuildKey = (key: string, id: string) =>
	key !== 'dm' &&
	id !== 'dm' &&
	key !== FRIENDS.id &&
	!key.startsWith(GROUP_PREFIX)

export class Data {
	usersCollection: UsersCollection = {}
	_storageAutoSaveProtocol_interval: ReturnType<typeof setInterval> | undefined

	withStart() {
		return this
	}

	/** Remembers who a message that is being sent replies to and mentions. */
	onMessagePreSend(
		channelId: string,
		message: { content?: string },
		extra: { replyOptions?: ReplyOptions },
	) {
		const { ChannelStore, GuildStore, MessageStore, UserStore } = stores()
		const target = new Set<Entry>()
		const now = Date.now()
		const { replyOptions } = extra

		const guild = (() => {
			const channel = ChannelStore?.getChannel(channelId)
			return GuildStore?.getGuild(channel?.guild_id) || undefined
		})()

		if (replyOptions?.messageReference) {
			const { channel_id, message_id } = replyOptions.messageReference
			const message = MessageStore?.getMessage(channel_id, message_id)
			if (!message) {
				return
			}
			const { author } = message

			if (author)
				target.add({ user: author, source: guild, extra: { updatedAt: now } })
		}

		if (message.content) {
			const { content } = message
			const ids = [...content.matchAll(/<@!?(?<id>\d{17,23})>/g)].map(
				({ groups }) => groups?.id,
			)

			const users = ids
				.map(id => UserStore?.getUser(id))
				.filter((user): user is User => Boolean(user))
			for (const user of users) {
				target.add({ user, source: guild, extra: { updatedAt: now } })
			}
		}

		this.processUsersToCollection([...target])
	}

	processUsersToCollection(array: Entry[]) {
		const target = this.usersCollection

		for (const { user, source, extra } of array) {
			if (!user || user.bot) {
				continue
			}

			const groupKey = source?.id ?? 'dm'
			target[groupKey] ||= {
				name: source?.name || 'dm',
				id: source?.id ?? 'dm',
				users: {},
				inviteLink: undefined,
			}
			const usersField = (target[groupKey] as GroupData).users
			const previouExtra = usersField[user.id]?.extra ?? {}
			const { id, username } = user

			usersField[id] = {
				id,
				username,
				tag:
					user.discriminator === '0' || !user.tag ? user.username : user.tag,
				extra: { ...previouExtra, ...extra },
				iconURL: avatarOf(user),
			}
		}
	}

	updateStorage() {
		store.replace('data', JSON.parse(JSON.stringify(this.usersCollection)))
		diag.log('storage', `saved ${count(this.usersCollection)} people`)
	}

	initializeUsersCollection() {
		const data = store.get('data')
		this.usersCollection = data ? JSON.parse(JSON.stringify(data)) : {}
	}

	/** Remembers the members of the servers you own (up to a thousand of each). */
	writeMembersFromUserGuildsToCollection() {
		const { GuildStore, GuildMemberStore, UserStore } = stores()
		const target = new Set<Entry>()
		const now = Date.now()

		const clientId = UserStore?.getCurrentUser()?.id
		if (!clientId) {
			return
		}
		for (const guild of Object.values(GuildStore?.getGuilds() ?? {})) {
			const { ownerId } = guild
			if (ownerId !== clientId) {
				continue
			}

			const members = [...(GuildMemberStore?.getMembers(guild.id) ?? [])]
			if (members.length > LIMIT) {
				members.length = LIMIT
			}
			for (const member of members) {
				const user = UserStore?.getUser(member.userId)
				if (user) target.add({ user, source: guild, extra: { updatedAt: now } })
			}

			this.processUsersToCollection([...target])
		}
	}

	/** Remembers the owner of every server you are in. */
	writeGuildsOwnersToCollection() {
		const { GuildStore, UserStore } = stores()
		const target = new Set<Entry>()
		const now = Date.now()

		for (const guild of Object.values(GuildStore?.getGuilds() ?? {})) {
			const { ownerId } = guild
			const owner = UserStore?.getUser(ownerId)
			if (!owner) {
				continue
			}
			target.add({
				user: owner,
				source: guild,
				extra: { isOwner: true, updatedAt: now },
			})
		}

		this.processUsersToCollection([...target])
	}

	/**
	 * Remembers your friends, under "Friends". Not in Equicord, which keeps a friend only once you mention or reply to them.
	 */
	writeFriendsToCollection() {
		const { RelationshipStore, UserStore } = stores()
		const now = Date.now()
		const ids = RelationshipStore?.getFriendIDs() ?? []
		const users = ids
			.map(id => UserStore?.getUser(id))
			.filter((user): user is User => Boolean(user))
		found.friends = `${users.length} of ${ids.length} friend ids are known users${RelationshipStore ? '' : ' (no RelationshipStore)'}`
		this.processUsersToCollection(
			users.map(user => ({ user, source: FRIENDS, extra: { updatedAt: now } })),
		)
	}

	/**
	 * Remembers the people you have DMs with, under "dm", and the members of your group DMs, under each group. Not in
	 * Equicord either.
	 */
	writePrivateChannelsToCollection() {
		const { ChannelStore, UserStore } = stores()
		const now = Date.now()
		const target: Entry[] = []
		const dmIds = ChannelStore?.getDMUserIds?.() ?? []
		const channels = ChannelStore?.getSortedPrivateChannels?.() ?? []
		found.dms = `${dmIds.length} DM user ids, ${channels.filter(c => c.type === GROUP_DM).length} group DMs of ${channels.length} private channels${ChannelStore?.getDMUserIds ? '' : ' (no getDMUserIds)'}`
		for (const id of dmIds) {
			const user = UserStore?.getUser(id)
			if (user) target.push({ user, extra: { updatedAt: now } })
		}
		for (const channel of channels) {
			if (channel.type !== GROUP_DM) continue
			const users = (channel.recipients ?? [])
				.map(id => UserStore?.getUser(id))
				.filter((user): user is User => Boolean(user))
			const source = {
				id: `${GROUP_PREFIX}${channel.id}`,
				name: channel.name || users.map(user => user.username).join(', ') || 'Group DM',
			}
			for (const user of users)
				target.push({ user, source, extra: { updatedAt: now } })
		}
		this.processUsersToCollection(target)
	}

	storageAutoSaveProtocol() {
		this._storageAutoSaveProtocol_interval = setInterval(
			this.updateStorage.bind(this),
			AUTOSAVE_MS,
		)
	}
}

/** What the last passes found, for the report (counts only). */
export const found: Record<string, string> = {}

/** The address of a user's profile picture. */
function avatarOf(user: User): string | undefined {
	try {
		return user.getAvatarURL?.() || undefined
	} catch {
		return undefined
	}
}

/** How many people a collection has, counting someone once per server they were met in. */
export const count = (collection: UsersCollection) =>
	Object.values(collection).reduce(
		(sum, group) => sum + Object.keys(group.users).length,
		0,
	)

/** The data of the running plugin. Set while it runs; the settings screen reads the saved data otherwise. */
export let current: Data | undefined

export function setCurrent(data: Data | undefined): void {
	current = data
}
