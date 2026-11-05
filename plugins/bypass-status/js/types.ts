/** The plugin's settings, stored as JSON. See `DEFAULT_SETTINGS` in `constants.ts` for what each one does. */
export interface BypassSettings {
	/** True: every message may bypass Do Not Disturb. False: only the list. */
	everyone: boolean
	/** The list, as JSON text: `{"users":[],"channels":[],"guilds":[]}`. */
	listsJson: string
	/** Also show a banner of this plugin. */
	ownBanner: boolean
	/** Buzz once with that banner. */
	ownBannerBuzz: boolean
}

/** The three kinds of things on the list. */
export type ListKind = 'users' | 'channels' | 'guilds'

/** The people, chats or channels, and servers whose messages may bypass Do Not Disturb, as Discord ids. */
export interface BypassList {
	users: string[]
	channels: string[]
	guilds: string[]
}

/** One thing on the list. */
export interface ListEntry {
	kind: ListKind
	id: string
}

/** A chat or channel, as Discord's channel store keeps it. */
export interface Channel {
	id: string
	type?: number
	name?: string
	guild_id?: string
	guildId?: string
	recipients?: Array<string | { id: string }>
}

/** A server, as Discord's guild store keeps it. */
export interface Guild {
	id: string
	name?: string
}

/** A user, as Discord's user store keeps it. */
export interface User {
	id?: string
	username?: string
	globalName?: string | null
	global_name?: string | null
}

/** A new message, as Discord's code passes it around. */
export interface Message {
	id?: string
	channel_id?: string
	guild_id?: string
	content?: string
	flags?: number
	attachments?: unknown[]
	author?: { id: string; username?: string; global_name?: string | null }
}

/** A Flux event that may carry a new message. */
export interface MessageEvent {
	type?: string
	optimistic?: boolean
	message?: Message
}

/** What the menu sheet being shown is about, and when that was noted. */
export interface MenuTarget extends ListEntry {
	at: number
}

/** What the plugin found in Discord and what it has done. Shown on the settings screen and in the report. */
export interface HookState {
	notificationUtils: string
	patched: string[]
	error: string
	bypassed: number
	last: string
}

/** The stores the plugin reads, described only as far as it uses them. */
export interface PluginStores {
	ChannelStore: { getChannel(id: string): Channel | undefined }
	GuildStore: {
		getGuild(id: string): Guild | undefined
		getGuilds(): Record<string, Guild>
	}
	UserStore: { getUser(id: string): User | undefined; getCurrentUser(): User }
	SelfPresenceStore: { getStatus(): string }
	SelectedChannelStore: { getChannelId(): string | undefined }
	PrivateChannelSortStore: { getPrivateChannelIds(): unknown[] }
}

/** Discord's module that decides whether a message notifies. */
export interface NotificationUtils {
	shouldNotify: (
		message: Message,
		channelId: string,
		includeSelectedChannel: boolean,
		ignoreStatus?: boolean,
	) => boolean
}
