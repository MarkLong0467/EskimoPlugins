import { store } from './discord'
import type {
	CurrentTrack,
	PresenceStore,
	SpotifyActivity,
	SpotifyStore,
	UserStore,
} from './types'

/** Whether an activity is Spotify's, by its name, its id, or the id of its party. */
function isSpotifyActivity(
	activity: SpotifyActivity | undefined,
): activity is SpotifyActivity {
	return (
		!!activity &&
		activity.type === 2 &&
		(activity.name === 'Spotify' ||
			String(activity.id || '').indexOf('spotify') === 0 ||
			String(activity.party?.id || '').indexOf('spotify:') === 0)
	)
}

/**
 * What you are listening to. Discord's Spotify store is empty on some phones even while Spotify is playing, so fall
 * back to your own presence, the activity other people see.
 */
export function mySpotifyActivity(): SpotifyActivity | undefined {
	const own = store<SpotifyStore>('SpotifyStore')?.getActivity?.()
	if (own?.party?.id) return own
	try {
		const self = store<UserStore>('UserStore')?.getCurrentUser()
		const presence = store<PresenceStore>('PresenceStore')
		const list = (self && presence?.getActivities?.(self.id)) || []
		for (const activity of list)
			if (isSpotifyActivity(activity)) return activity
	} catch {
		// Fall back to what the store said.
	}
	return own
}

/** Their Spotify activity right now, from Discord's presence store. Only one with a session (a party) counts. */
export function spotifyActivityOf(userId: string): SpotifyActivity | undefined {
	try {
		const list =
			store<PresenceStore>('PresenceStore')?.getActivities?.(userId) || []
		for (const activity of list)
			if (isSpotifyActivity(activity) && activity.party?.id) return activity
	} catch {
		// Presence is not available.
	}
	return undefined
}

/** The id of the person whose session an activity is: its party id looks like `spotify:<user id>`. */
export function userIdOf(
	activity: { party?: { id?: string } } | undefined,
): string | undefined {
	const id = activity?.party?.id
	return typeof id === 'string' && id.indexOf(':') > 0
		? id.split(':')[1]
		: undefined
}

/** The song playing on your own Spotify: its track id and album id. */
export function currentTrack(): CurrentTrack {
	const track = store<SpotifyStore>('SpotifyStore')?.getTrack?.()
	const activity = mySpotifyActivity()
	const meta = activity?.metadata || {}
	let albumId = track?.album?.id || meta.album_id
	if (!albumId && typeof meta.context_uri === 'string') {
		const match = /^spotify:album:(\w+)/.exec(meta.context_uri)
		if (match) albumId = match[1]
	}
	return { trackId: track?.id || activity?.sync_id, albumId }
}

/** Something that changes when the other person's song changes, so a change can be noticed. */
export function songKey(activity: SpotifyActivity | undefined): string {
	const meta = activity?.metadata || {}
	const times = activity?.timestamps || {}
	return [
		activity?.sync_id,
		times.start || '',
		activity?.details,
		meta.album_id || '',
	].join('|')
}
