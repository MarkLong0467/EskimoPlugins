import type { SpotifySettings } from './types'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'ESKIMO_SPOTIFY_TOOLS'

/** The switches used until the user turns one off. */
export const DEFAULT_SETTINGS: SpotifySettings = {
	listenAlong: true,
	sendInvite: true,
	sendSongLink: true,
	sendAlbumLink: true,
	plusMenu: true,
}

/** Labels of the rows of the + menu. A menu with two of them is taken for the + menu. */
export const PLUS_LABELS: Record<string, 1> = {
	Camera: 1,
	Photos: 1,
	Poll: 1,
	Files: 1,
	Apps: 1,
}

/** What the + menu's icons are called: a camera, a picture, a poll, a paperclip, an app. */
export const PLUS_ICONS = [
	/camera/i,
	/image|photo|picture|gallery/i,
	/poll/i,
	/paperclip|attach|file|document/i,
	/\bapps?\b|sparkle|robot|bot/i,
]

/** The names Discord's menu items use for what happens when they are tapped. */
export const PRESS_PROPS = [
	'action',
	'onPress',
	'onSelect',
	'onClick',
	'callback',
	'handler',
] as const

/** Fields that identify one particular menu item. They are dropped when an item is copied, so each copy is its own. */
export const IDENTITY_PROPS = [
	'id',
	'key',
	'testID',
	'nativeID',
	'index',
	'state',
] as const

/** The fewest and most items a menu may have to be taken for the + menu. */
export const MENU_MIN_ITEMS = 2
export const MENU_MAX_ITEMS = 24

/** How long to wait for Spotify's player update before going on anyway (milliseconds). */
export const PLAYER_STATE_TIMEOUT_MS = 1200

/** How often the other person's song is checked while following (milliseconds). */
export const FOLLOW_INTERVAL_MS = 1000

/** How soon after a presence update the song is checked (milliseconds). */
export const FOLLOW_NUDGE_MS = 50

/** How long their Spotify may be missing before following stops (milliseconds). It can vanish for a moment between songs. */
export const FOLLOW_GONE_MS = 60000

/** A second tap on a send option within this time counts as the same tap (milliseconds). */
export const PRESS_DEBOUNCE_MS = 1500

/** How long the Listen along button shows its spinner after Spotify answers, and at the longest (milliseconds). */
export const SPINNER_AFTER_MS = 2500
export const SPINNER_MAX_MS = 15000

/** Spotify's web API. */
export const SPOTIFY_API = 'https://api.spotify.com/v1'

/** What Spotify's answers mean to the person. */
export const PLAY_ERRORS: Record<number, string> = {
	401: 'Spotify sign-in expired. Open Spotify and try again.',
	403: 'Spotify Premium is needed to listen along.',
	404: 'No Spotify device found. Open Spotify on this phone first.',
	429: 'Spotify is busy. Try again in a moment.',
}
