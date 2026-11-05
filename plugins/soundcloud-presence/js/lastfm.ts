import { apply } from './apply'
import { LASTFM_BLANK, MIN_POLL_SECONDS, TAG } from './constants'
import { searchLink } from './format'
import { notifyListeners, read, setStatus, state, tuning } from './state'
import type { LastfmAnswer, NowPlaying, Track } from './types'

/** Gives up on a request that takes too long, so one stuck request cannot hold up every later check. */
function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(message)),
			tuning.requestTimeout,
		)
		promise.then(
			value => {
				clearTimeout(timer)
				resolve(value)
			},
			error => {
				clearTimeout(timer)
				reject(error)
			},
		)
	})
}

/**
 * Calls a Last.fm method for the user's name and API key.
 *
 * @param method For example `user.getrecenttracks`.
 * @param params The method's own parameters.
 * @throws If the name or key is missing, Last.fm says no, or it does not answer in time.
 */
async function lastfm(
	method: string,
	params: Record<string, string>,
): Promise<LastfmAnswer> {
	const s = read()
	const user = String(s.lfmUser || '').trim()
	const key = String(s.lfmKey || '').trim()
	if (!user || !key)
		throw new Error('Enter your Last.fm name and API key first')
	const qs = Object.keys(params)
		.map(k => `${k}=${encodeURIComponent(params[k])}`)
		.join('&')
	// The changing "_" value keeps a cached copy of an older answer from being served.
	const url = `https://ws.audioscrobbler.com/2.0/?method=${method}&api_key=${encodeURIComponent(key)}&format=json&${qs}&_=${Date.now()}`
	return withTimeout(
		(async () => {
			const res = await fetch(url)
			let data: LastfmAnswer | undefined
			try {
				data = await res.json()
			} catch {
				// Not JSON: the status below says what went wrong.
			}
			if (!res.ok || data?.error)
				throw new Error(
					data?.message
						? `Last.fm: ${data.message}`
						: `Last.fm said no (${res.status})`,
				)
			return data as LastfmAnswer
		})(),
		'Last.fm did not answer in time',
	)
}

/** A song or artist name made easy to compare: lower case, without bracketed parts, with spaces for punctuation. */
function normalize(s: unknown): string {
	return String(s == null ? '' : s)
		.toLowerCase()
		.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
		.replace(/[\s\-_.,:;!?'"|/\\&+]+/g, ' ')
		.trim()
}

/**
 * Looks a song up in Apple Music's public search for its cover.
 * A result only counts when both the title and the artist match, so a wrong cover is never shown. Songs that exist only
 * on SoundCloud are usually not there.
 *
 * @returns The link to a 600 pixel cover, or an empty text.
 */
async function findCover(artist: string, title: string): Promise<string> {
	try {
		const res = await withTimeout(
			fetch(
				`https://itunes.apple.com/search?media=music&entity=song&limit=5&term=${encodeURIComponent(`${artist} ${title}`)}`,
			),
			'Apple Music did not answer in time',
		)
		if (!res.ok) return ''
		const data = (await res.json()) as {
			results?: Array<{
				trackName?: string
				artistName?: string
				artworkUrl100?: string
			}>
		}
		const wantTitle = normalize(title)
		const wantArtist = normalize(artist)
		if (!wantTitle || !wantArtist) return ''
		for (const item of data?.results || []) {
			const t = normalize(item.trackName)
			const a = normalize(item.artistName)
			const titleOk =
				t &&
				(t === wantTitle ||
					t.indexOf(wantTitle) === 0 ||
					wantTitle.indexOf(t) === 0)
			const artistOk =
				a && (a.indexOf(wantArtist) >= 0 || wantArtist.indexOf(a) >= 0)
			if (titleOk && artistOk && item.artworkUrl100)
				return String(item.artworkUrl100).replace('100x100bb', '600x600bb')
		}
	} catch {
		// No cover is found; the default cover is used.
	}
	return ''
}

/** The largest real picture of a list of Last.fm images. Last.fm's empty picture does not count. */
function pickImage(images: unknown): string {
	if (!Array.isArray(images)) return ''
	for (let i = images.length - 1; i >= 0; i--) {
		const url = images[i]?.['#text']
		if (url && url.indexOf(LASTFM_BLANK) < 0) return url
	}
	return ''
}

/**
 * The song Last.fm says you are playing right now.
 *
 * @returns The song, or nothing if Last.fm says nothing is playing.
 */
export async function fetchNowPlaying(): Promise<NowPlaying | null> {
	const data = await lastfm('user.getrecenttracks', {
		user: String(read().lfmUser).trim(),
		limit: '1',
	})
	const list = (data?.recenttracks as { track?: unknown } | undefined)?.track
	const t = (Array.isArray(list) ? list[0] : list) as
		| {
				'@attr'?: { nowplaying?: unknown }
				artist?: { '#text'?: string; name?: string }
				name?: string
				album?: { '#text'?: string }
				image?: unknown
		  }
		| undefined
	if (!t || !t['@attr'] || String(t['@attr'].nowplaying) !== 'true') return null
	const artist = t.artist?.['#text'] || t.artist?.name || ''
	const title = t.name || ''
	if (!title) return null
	return {
		artist,
		title,
		album: t.album?.['#text'] || '',
		artwork: pickImage(t.image),
	}
}

/** Fills in what takes extra requests (length, album, cover) and updates the status once if anything was found. */
async function enrich(track: Track): Promise<void> {
	try {
		const wantCover = !track.artwork && read().coverLookup
		const results = await Promise.all([
			lastfm('track.getinfo', {
				artist: track.artist,
				track: track.title,
				autocorrect: '1',
			}).then(
				v => v,
				() => null,
			),
			wantCover ? findCover(track.artist, track.title) : '',
		])
		if (!state.active || state.auto !== track) return
		const found = results[0]?.track as
			| { duration?: unknown; album?: { title?: string; image?: unknown } }
			| undefined
		let changed = false
		const duration = Number(found?.duration) || 0
		if (duration && duration !== track.duration) {
			track.duration = duration
			changed = true
		}
		if (!track.album && found?.album?.title) {
			track.album = found.album.title
			changed = true
		}
		if (!track.artwork) {
			// The track's own album art is preferred, then the Apple Music result.
			const art =
				(found?.album && pickImage(found.album.image)) || results[1] || ''
			if (art) {
				track.artwork = art
				changed = true
			}
		}
		if (changed) await apply()
	} catch (error) {
		console.warn(`${TAG} extra lookups failed:`, String(error))
	}
}

/**
 * Checks Last.fm once and keeps `state.auto` in step with what is playing.
 *
 * A new song goes on the profile at once; its length and a better cover are looked up afterwards. The first time Last.fm
 * reports nothing, one more look is taken a few seconds later before the status is cleared, so the gap between two songs
 * does not make it flicker off.
 */
export async function poll(): Promise<void> {
	const s = read()
	if (
		state.polling ||
		!state.active ||
		!s.autoEnabled ||
		!String(s.lfmUser).trim() ||
		!String(s.lfmKey).trim()
	)
		return
	state.polling = true
	state.lastPollAt = Date.now()
	try {
		const np = await fetchNowPlaying()
		if (!state.active) return
		if (!np) {
			if (state.auto) {
				if (!state.missPending) {
					state.missPending = true
					clearTimeout(state.missTimer)
					state.missTimer = setTimeout(poll, tuning.recheckMs)
					return
				}
				state.missPending = false
				state.auto = null
				await apply()
			}
			return
		}
		state.missPending = false
		clearTimeout(state.missTimer)
		const key = `${np.artist}\u0001${np.title}`
		if (state.auto && state.auto.key === key) return
		const track: Track = {
			key,
			url: '',
			searchUrl: searchLink(np.artist, np.title),
			title: np.title,
			artist: np.artist,
			artistUrl: '',
			album: np.album || '',
			artwork: np.artwork || '',
			duration: 0,
			startedAt: Date.now(),
		}
		state.auto = track
		await apply()
		enrich(track)
	} catch (error) {
		setStatus({
			state: 'error',
			text: String(
				(error as { message?: unknown } | undefined)?.message || error,
			),
		})
	} finally {
		state.polling = false
		notifyListeners()
	}
}

/**
 * Starts, changes or stops the regular check of Last.fm, from the settings. When automatic mode is off, the automatic
 * track is dropped and the status falls back to the chosen link.
 */
export function restartPolling(): void {
	clearInterval(state.pollTimer)
	state.pollTimer = undefined
	const s = read()
	if (!state.active || !s.autoEnabled) {
		if (state.auto) {
			state.auto = null
			if (state.active) apply()
		}
		return
	}
	const seconds = Math.max(
		MIN_POLL_SECONDS,
		Number.parseInt(String(s.pollSeconds), 10) || 10,
	)
	state.pollTimer = setInterval(poll, seconds * 1000)
	poll()
}
