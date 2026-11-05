import { PLAY_ERRORS, SPOTIFY_API } from './constants'
import { errorText, rest, store, toast } from './discord'
import type { SpotifyAccess, SpotifyActivity, SpotifyStore } from './types'

/**
 * The Spotify sign-in Discord holds for you. Discord's own store has it when Spotify is the active player, and
 * otherwise the linked account is asked for a fresh token through Discord's web API.
 *
 * @returns A token for Spotify's web API (if one could be found) and the device Discord says is active.
 */
async function spotifyAccess(): Promise<SpotifyAccess> {
	const spotify = store<SpotifyStore>('SpotifyStore')
	const sd = spotify?.getActiveSocketAndDevice?.()
	const socket = sd && (sd.socket || sd)
	let token = socket?.accessToken
	let accountId = socket?.accountId
	const http = rest()
	if (!token && http?.get) {
		try {
			if (!accountId) {
				const list = await http.get({ url: '/users/@me/connections' })
				const linked = (
					(list?.body as Array<{
						type?: string
						revoked?: boolean
						id?: string
					}>) || []
				).find(c => c && c.type === 'spotify' && !c.revoked)
				accountId = linked?.id
			}
			if (accountId) {
				const res = await http.get({
					url: `/users/@me/connections/spotify/${accountId}/access-token`,
				})
				token = (res?.body as { access_token?: string } | undefined)
					?.access_token
			}
		} catch {
			// No token: the caller says so.
		}
	}
	return { token, deviceId: sd?.device?.id }
}

/** A device to play on: the one Spotify says is active, otherwise the first one it lists. */
async function pickDevice(token: string): Promise<string | undefined> {
	try {
		const res = await fetch(`${SPOTIFY_API}/me/player/devices`, {
			headers: { Authorization: `Bearer ${token}` },
		})
		if (!res.ok) return undefined
		const body = (await res.json()) as {
			devices?: Array<{
				id: string
				is_active?: boolean
				is_restricted?: boolean
			}>
		}
		const devices = (body?.devices || []).filter(d => d && !d.is_restricted)
		const chosen = devices.find(d => d.is_active) || devices[0]
		return chosen?.id
	} catch {
		return undefined
	}
}

/** An album link or id as a Spotify uri (`spotify:album:...`), or nothing if it is neither. */
function albumUri(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const match =
		/^(?:spotify:album:|https?:\/\/(?:open\.)?spotify\.com\/album\/)(\w+)/.exec(
			value,
		)
	return match
		? `spotify:album:${match[1]}`
		: /^\w{10,}$/.test(value)
			? `spotify:album:${value}`
			: undefined
}

/** The album of the other person's track, from their activity or else from Spotify. */
async function albumOf(
	token: string,
	activity: SpotifyActivity,
	trackId: string,
): Promise<string | undefined> {
	const meta = activity?.metadata || {}
	const album = meta.album && typeof meta.album === 'object' ? meta.album : {}
	const guesses = [
		meta.album_uri,
		meta.context_uri,
		album.uri,
		album.id,
		meta.album_id,
	]
	for (const guess of guesses) {
		const uri = albumUri(guess)
		if (uri) return uri
	}
	try {
		const res = await fetch(
			`${SPOTIFY_API}/tracks/${encodeURIComponent(trackId)}`,
			{ headers: { Authorization: `Bearer ${token}` } },
		)
		if (!res.ok) return undefined
		const track = (await res.json()) as {
			album?: { uri?: string; id?: string }
		}
		return (
			track?.album && (albumUri(track.album.uri) || albumUri(track.album.id))
		)
	} catch {
		return undefined
	}
}

/**
 * Plays the other person's track at their position, through Spotify's own web API.
 * Asking Spotify for the bare track can stop your song and play nothing, so the track is started inside its album.
 *
 * @param activity Their Spotify activity.
 * @param quiet True to skip the "Listening along" toast (used when following their next song).
 * @returns Whether it worked. When it did not, a toast says why.
 */
export async function playThroughSpotify(
	activity: SpotifyActivity,
	quiet?: boolean,
): Promise<boolean> {
	try {
		const access = await spotifyAccess()
		if (!access.token)
			throw new Error(
				'No Spotify sign-in found. Link Spotify in Discord and open the Spotify app.',
			)
		const raw = activity.sync_id
		const trackId =
			typeof raw === 'string' ? raw.replace(/^spotify:track:/, '') : ''
		if (!trackId) throw new Error('This activity has no track to play.')
		const album = await albumOf(access.token, activity, trackId)
		if (!album) throw new Error('Could not find the album of that track.')
		const deviceId = (await pickDevice(access.token)) || access.deviceId
		const start = activity.timestamps && Number(activity.timestamps.start)
		const position = start ? Math.max(0, Date.now() - start) : 0
		const url = `${SPOTIFY_API}/me/player/play${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ''}`
		const res = await fetch(url, {
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${access.token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				context_uri: album,
				offset: { uri: `spotify:track:${trackId}` },
				position_ms: position,
			}),
		})
		if (!res.ok)
			throw new Error(
				PLAY_ERRORS[res.status] || `Spotify said no (${res.status}).`,
			)
		if (!quiet) toast('Listening along')
		return true
	} catch (error) {
		toast(errorText(error))
		return false
	}
}
