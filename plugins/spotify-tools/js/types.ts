/** The plugin's switches. Each is on unless it was turned off. */
export interface SpotifySettings {
	/** The Listen along button next to Play on Spotify. */
	listenAlong: boolean
	/** The "Send listen along" option. */
	sendInvite: boolean
	/** The "Send song link" option. */
	sendSongLink: boolean
	/** The "Send playing album" option. */
	sendAlbumLink: boolean
	/** Whether the send options show in the + menu. */
	plusMenu: boolean
}

/** A Spotify activity, as Discord shows it on a profile or in a presence. Only the fields the plugin reads are listed. */
export interface SpotifyActivity {
	id?: string
	name?: string
	type?: number
	details?: string
	sync_id?: string
	party?: { id?: string }
	timestamps?: { start?: number | string }
	metadata?: {
		album_id?: string
		album_uri?: string
		context_uri?: string
		album?: { uri?: string; id?: string } | string
	}
}

/** The song playing on your own Spotify: the ids that links need. */
export interface CurrentTrack {
	trackId: string | undefined
	albumId: string | undefined
}

/** Discord's Spotify controls: start playing someone's song, and join their session. */
export interface SpotifyActions {
	play(activity: SpotifyActivity, userId: string): unknown
	sync(activity: SpotifyActivity, userId: string): unknown
}

/** The Spotify sign-in Discord holds: a token for Spotify's web API, and the device Discord thinks is active. */
export interface SpotifyAccess {
	token: string | undefined
	deviceId: string | undefined
}

/** The part of Discord's connection to its web API that the plugin uses. */
export interface Rest {
	get?(options: { url: string }): Promise<{ body?: unknown } | undefined>
}

/** The song being followed: whose it is, which song, and when their Spotify last vanished. */
export interface Follow {
	userId: string
	key: string
	goneAt?: number
}

/** One of the send options in the + menu. */
export interface SendOption {
	/** The setting that switches it on or off. */
	setting: keyof SpotifySettings
	label: string
	run: () => void
}

/** One item of a menu that is a list of items. Discord adds more fields than are listed. */
export interface MenuItem {
	label?: string
	iconSource?: unknown
	IconComponent?: unknown
	[field: string]: unknown
}

/** The stores the plugin reads, described only as far as it uses them. */
export interface SpotifyStore {
	getActivity?(): SpotifyActivity | undefined
	getTrack?(): { id?: string; album?: { id?: string } } | undefined
	getActiveSocketAndDevice?():
		| {
				socket?: { accessToken?: string; accountId?: string }
				accessToken?: string
				accountId?: string
				device?: { id?: string }
		  }
		| undefined
}
export interface UserStore {
	getCurrentUser(): { id: string } | undefined
}
export interface PresenceStore {
	getActivities?(userId: string): SpotifyActivity[]
}
export interface DraftStore {
	getDraft(channelId: string, type: number): string | undefined
}
export interface ChannelStore {
	getChannel(channelId: string): { name?: string } | undefined
}
export interface SelectedChannelStore {
	getChannelId(): string | undefined
}

/** Discord's code for sending and drafts. */
export interface MessageSender {
	sendMessage(
		channelId: string,
		message: object,
		clearDraft: boolean,
		options: object,
	): unknown
}
export interface DraftActions {
	clearDraft(channelId: string, type: number): unknown
}
