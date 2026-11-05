import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { END_POLL_GRACE_MS, MAX_RECENTS, TAG } from './constants'
import { parseLink } from './format'
import { poll } from './lastfm'
import { lookup } from './lookup'
import {
	buildActivity,
	dispatchActivity,
	dispatchNow,
	effective,
	otherListening,
	progressEnd,
} from './present'
import { clearRich, pushRich } from './rich'
import { read, save, setStatus, state, toast } from './state'

/**
 * Puts the right status on the profile for the current settings and track.
 *
 * The status is cleared when the plugin is off or there is no track, when another app (such as Spotify) is already showing
 * a "Listening to" card, and when a track with a known length has finished. Otherwise the track is sent: through Rich
 * Presence when that is chosen, or by this plugin. It also sets two timers: one to ask Last.fm what comes next just after
 * the track ends, and one to clear the status at the end.
 */
export async function apply(): Promise<void> {
	clearTimeout(state.endTimer)
	clearTimeout(state.endPollTimer)
	if (!state.active) return
	const seq = ++state.applySeq
	const settings = read()
	const track = effective(settings)
	try {
		if (!settings.enabled || !track) {
			clearRich()
			dispatchActivity(null)
			return
		}
		if (settings.hideWithSpotify && otherListening()) {
			setStatus({
				state: 'hidden',
				text: 'Hidden while another app is showing what it plays, such as Spotify.',
			})
			clearRich()
			dispatchActivity(null)
			return
		}
		const end = progressEnd(settings, track)
		if (settings.clearAtEnd && end && Date.now() >= end) {
			setStatus({ state: 'ended', text: 'That track has finished.' })
			clearRich()
			dispatchActivity(null)
			return
		}
		if (settings.output === 'rich') {
			dispatchActivity(null)
			pushRich(settings, track)
		} else {
			clearRich()
			const activity = await buildActivity(settings, track)
			if (seq !== state.applySeq || !state.active) return
			dispatchActivity(activity)
		}
		setStatus({ state: 'ok', text: '' })
		// When a song with a known length is about to end, ask Last.fm what comes next without waiting for the next check.
		if (settings.autoEnabled && track === state.auto && track.duration > 0) {
			const trackEnd = track.startedAt + track.duration
			state.endPollTimer = setTimeout(
				poll,
				Math.max(500, trackEnd - Date.now() + END_POLL_GRACE_MS),
			)
		}
		if (settings.clearAtEnd && end)
			state.endTimer = setTimeout(
				() => apply(),
				Math.max(1000, end - Date.now() + 1500),
			)
	} catch (error) {
		console.warn(`${TAG} apply failed:`, String(error))
	}
}

/**
 * Looks a link up, makes it the current track, remembers it in the recent list and puts it on the profile.
 *
 * @returns Whether it worked. When it did not, the preview and a toast say why.
 */
export async function showTrack(link: string): Promise<boolean> {
	setStatus({ state: 'loading', text: 'Looking up the track…' })
	try {
		const found = await lookup(link)
		const track = { ...found, startedAt: Date.now() }
		const settings = read()
		const seen = Object.assign({}, track, { startedAt: undefined })
		const recents = [seen]
			.concat(
				settings.recents.filter(r => r.url !== track.url) as (typeof seen)[],
			)
			.slice(0, MAX_RECENTS)
		await save({ current: track, recents })
		await apply()
		if (!settings.enabled)
			toast('Saved. Turn on Show status to put it on your profile.')
		else if (settings.autoEnabled && state.auto)
			toast(
				'Saved. Automatic mode is showing what Last.fm reports while a song plays.',
			)
		else toast(`Now showing ${track.title}`)
		return true
	} catch (error) {
		const message = String(
			(error as { message?: unknown } | undefined)?.message || error,
		)
		setStatus({ state: 'error', text: message })
		toast(message)
		return false
	}
}

/** Stops showing anything: forgets the current track and the automatic one and clears the status at once. */
export async function stopShowing(): Promise<void> {
	clearTimeout(state.endTimer)
	state.auto = null
	await save({ current: null })
	setStatus({ state: 'idle', text: '' })
	clearRich()
	dispatchNow(null)
}

/**
 * Shows the SoundCloud link that is in the clipboard.
 *
 * @param quiet True when it is a background check (when Discord opens): then nothing is said if there is no link, and a
 *   link that was already shown is skipped.
 * @returns Whether a track was shown.
 */
export async function checkClipboard(quiet: boolean): Promise<boolean> {
	try {
		const link = parseLink(await Clipboard.getString())
		if (!link) {
			if (!quiet) toast('There is no SoundCloud link in your clipboard')
			return false
		}
		if (quiet && (link === state.lastClip || read().current?.url === link))
			return false
		state.lastClip = link
		return await showTrack(link)
	} catch (error) {
		console.warn(`${TAG} clipboard check failed:`, String(error))
		return false
	}
}
