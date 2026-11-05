import { onFluxEventDispatched } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { songKey, spotifyActivityOf } from './activity'
import {
	FOLLOW_GONE_MS,
	FOLLOW_INTERVAL_MS,
	FOLLOW_NUDGE_MS,
	PLAYER_STATE_TIMEOUT_MS,
} from './constants'
import { errorText, store, toast } from './discord'
import { playThroughSpotify } from './web'
import type {
	Follow,
	SpotifyActions,
	SpotifyActivity,
	SpotifyStore,
} from './types'

/** Discord's Spotify controls, once found. */
let spotifyActions: SpotifyActions | undefined

/** The person whose songs are being followed, and the timers that watch them. */
let follow: Follow | undefined
let followTimer: ReturnType<typeof setInterval> | undefined
let followNudge: ReturnType<typeof setTimeout> | undefined

/** Whether something is Discord's Spotify controls: it needs both `play` and `sync`. */
export function isSpotifyActions(
	candidate: unknown,
): candidate is SpotifyActions {
	const value = candidate as Partial<SpotifyActions> | null | undefined
	return (
		!!value &&
		typeof value.play === 'function' &&
		typeof value.sync === 'function'
	)
}

/** Remembers Discord's Spotify controls if they are not known yet. */
export function noteSpotifyActions(module: unknown): void {
	if (!spotifyActions && isSpotifyActions(module)) spotifyActions = module
}

/** Forgets the controls and stops following. Used when the plugin stops. */
export function reset(): void {
	spotifyActions = undefined
	stopFollowing()
}

/** Discord's Spotify controls, but only a module that has both play and sync. */
function findSpotifyActions(): SpotifyActions | undefined {
	if (isSpotifyActions(spotifyActions)) return spotifyActions
	try {
		const [found] = lookupModule(withProps('play', 'sync'))
		if (isSpotifyActions(found)) return (spotifyActions = found)
	} catch {
		// Discord's own controls are not available: the web API is used instead.
	}
	return undefined
}

/**
 * Runs `callback` after the next Spotify player update. Some phones change the player without sending that event, so it
 * runs anyway after a short wait.
 *
 * @returns A function that cancels it.
 */
export function onceAfterPlayerState(callback: () => void): () => void {
	let done = false
	let off: (() => unknown) | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	const finish = () => {
		if (done) return
		done = true
		if (off) off()
		clearTimeout(timer)
		setTimeout(callback, 0)
	}
	off = onFluxEventDispatched('SPOTIFY_PLAYER_STATE', payload => {
		finish()
		return payload
	})
	timer = setTimeout(finish, PLAYER_STATE_TIMEOUT_MS)
	return () => {
		done = true
		if (off) off()
		clearTimeout(timer)
	}
}

/**
 * Starts Spotify on Discord's side, then joins the other person's session.
 *
 * @returns Whether it worked.
 */
function listenWithDiscord(
	actions: SpotifyActions,
	activity: SpotifyActivity,
	userId: string,
): Promise<boolean> {
	const sync = () =>
		Promise.resolve()
			.then(() => actions.sync(activity, userId))
			.then(
				() => true,
				error => {
					toast(`Spotify could not sync: ${errorText(error)}`)
					return false
				},
			)

	const mine = store<SpotifyStore>('SpotifyStore')?.getActivity?.()
	if (mine) return sync()
	return new Promise<boolean>(resolve => {
		const cancel = onceAfterPlayerState(() => {
			sync().then(resolve)
		})
		Promise.resolve()
			.then(() => actions.play(activity, userId))
			.catch(error => {
				cancel()
				toast(`Discord could not start Spotify: ${errorText(error)}`)
				resolve(false)
			})
	})
}

/** Stops following the other person's songs. */
export function stopFollowing(): void {
	follow = undefined
	if (followTimer) clearInterval(followTimer)
	followTimer = undefined
	if (followNudge) clearTimeout(followNudge)
	followNudge = undefined
}

/** When their song changes, joins again so your Spotify moves on with theirs. */
function checkFollowed(): void {
	const current = follow
	if (!current) return
	const latest = spotifyActivityOf(current.userId)
	if (!latest) {
		current.key = ''
		// Spotify presence can vanish for a moment between songs. A minute without it means they stopped.
		if (!current.goneAt) current.goneAt = Date.now()
		else if (Date.now() - current.goneAt > FOLLOW_GONE_MS) stopFollowing()
		return
	}
	current.goneAt = 0
	const key = songKey(latest)
	if (key === current.key) return
	current.key = key

	const actions = findSpotifyActions()
	if (actions) {
		Promise.resolve()
			.then(() => actions.play(latest, current.userId))
			.then(
				() => {
					onceAfterPlayerState(() => {
						try {
							actions.sync(latest, current.userId)
						} catch {
							// The next song change tries again.
						}
					})
				},
				() => {},
			)
	} else {
		playThroughSpotify(latest, true)
	}
}

/** Starts following a person's songs: it checks once a second, and sooner when Discord reports a presence change. */
function startFollowing(activity: SpotifyActivity, userId: string): void {
	stopFollowing()
	follow = { userId, key: songKey(activity) }
	followTimer = setInterval(checkFollowed, FOLLOW_INTERVAL_MS)
}

/** Called for every `PRESENCE_UPDATES` event: while following, checks their song soon. */
export function onPresenceUpdates<T>(payload: T): T {
	if (follow) {
		if (followNudge) clearTimeout(followNudge)
		followNudge = setTimeout(() => {
			followNudge = undefined
			checkFollowed()
		}, FOLLOW_NUDGE_MS)
	}
	return payload
}

/**
 * Starts listening along.
 *
 * Discord's own Spotify controls are used when they are found; otherwise Spotify's web API. When it worked, the other
 * person's songs are followed.
 *
 * @param reason Why the button cannot be used right now (the person sees it as a toast), or false when it can.
 * @returns False right away if there is a reason; otherwise a promise of whether it started.
 */
export function listen(
	reason: string | false,
	activity: SpotifyActivity,
	userId: string | undefined,
): false | Promise<boolean> {
	if (typeof reason === 'string') {
		toast(reason)
		return false
	}
	const id = userId as string
	const actions = findSpotifyActions()
	const started = actions
		? listenWithDiscord(actions, activity, id)
		: playThroughSpotify(activity)
	return Promise.resolve(started).then(ok => {
		if (ok) {
			if (actions) toast('Listening along')
			startFollowing(activity, id)
		}
		return ok
	})
}
