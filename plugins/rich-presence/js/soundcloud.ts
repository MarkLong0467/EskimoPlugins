import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { applySome } from './apply'
import { END_POLL_GRACE_MS, MAX_RECENTS, TAG } from './constants'
import { parseLink } from './format'
import { poll, restartPolling } from './lastfm'
import { lookup } from './lookup'
import {
	clearVars,
	effective,
	progressEnd,
	pushVars,
	soundCloudProblem,
} from './present'
import { soundCloudOn, soundCloudProfile, usesSoundCloud } from './profiles'
import { hooks, sc, setStatus } from './scstate'
import { read, saveSoundCloud, state, toast } from './state'

/**
 * Puts the SoundCloud track where it is shown for the current settings.
 *
 * The SoundCloud presence is taken away when its profile is off, there is no track, another app (such as Spotify) is already
 * showing a "Listening to" card, or a track with a known length has finished (the engine decides this with
 * `soundCloudProblem`). The custom profiles that use the track in their texts or as their timer get the variables or the
 * timer, and are sent again. Two timers are set: one asks Last.fm what comes next just after the track ends, and one
 * refreshes at the end, so the presence clears.
 */
export async function refreshSoundCloud(): Promise<void> {
	clearTimeout(sc.endTimer)
	clearTimeout(sc.endPollTimer)
	if (!state.active) return
	const settings = read()
	const profile = soundCloudProfile(settings)
	const s = settings.soundcloud
	const track = effective(s)
	const problem = soundCloudProblem(settings)
	const uses = settings.profiles.filter(usesSoundCloud).map(p => p.id)
	let varsChanged = false
	try {
		if (!soundCloudOn(settings) || !track || problem) {
			varsChanged = clearVars()
			if (problem === 'hidden by spotify')
				setStatus({
					state: 'hidden',
					text: 'Hidden while another app is showing what it plays, such as Spotify.',
				})
			else if (problem === 'track finished')
				setStatus({ state: 'ended', text: 'That track has finished.' })
		} else {
			pushVars(s, track)
			varsChanged = true
			setStatus({ state: 'ok', text: '' })
		}
		const ids = varsChanged ? uses : []
		if (profile) ids.push(profile.id)
		if (ids.length) await applySome(ids, false)
		if (!state.active || !soundCloudOn(read()) || !track || problem) return
		const end = progressEnd(s, track)
		// When a song with a known length is about to end, ask Last.fm what comes next without waiting for the next check.
		if (s.autoEnabled && track === sc.auto && track.duration > 0) {
			const trackEnd = track.startedAt + track.duration
			sc.endPollTimer = setTimeout(
				poll,
				Math.max(500, trackEnd - Date.now() + END_POLL_GRACE_MS),
			)
		}
		if (s.clearAtEnd && end)
			sc.endTimer = setTimeout(
				() => refreshSoundCloud(),
				Math.max(1000, end - Date.now() + 1500),
			)
	} catch (error) {
		console.warn(`${TAG} apply failed:`, String(error))
	}
}

hooks.refresh = refreshSoundCloud

/** Starts or stops the checks of Last.fm for the settings and puts the track where it is shown. Called when SoundCloud settings change. */
export function syncSoundCloud(): void {
	restartPolling()
	refreshSoundCloud().catch(error =>
		console.warn(`${TAG} apply failed:`, String(error)),
	)
}

/**
 * Looks a link up, makes it the current track, remembers it in the recent list and shows it.
 *
 * @returns Whether it worked. When it did not, the preview and a toast say why.
 */
export async function showTrack(link: string): Promise<boolean> {
	setStatus({ state: 'loading', text: 'Looking up the track…' })
	try {
		const found = await lookup(link)
		const track = { ...found, startedAt: Date.now() }
		const settings = read()
		const s = settings.soundcloud
		const seen = Object.assign({}, track, { startedAt: undefined })
		const recents = [seen]
			.concat(s.recents.filter(r => r.url !== track.url) as (typeof seen)[])
			.slice(0, MAX_RECENTS)
		await saveSoundCloud({ current: track, recents })
		await refreshSoundCloud()
		if (!soundCloudOn(settings))
			toast('Saved. Turn on the SoundCloud presence to put it on your profile.')
		else if (s.autoEnabled && sc.auto)
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

/** Stops showing anything: forgets the current track and the automatic one and clears the presence at once. */
export async function stopShowing(): Promise<void> {
	clearTimeout(sc.endTimer)
	sc.auto = null
	await saveSoundCloud({ current: null })
	setStatus({ state: 'idle', text: '' })
	await refreshSoundCloud()
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
		if (
			quiet &&
			(link === sc.lastClip || read().soundcloud.current?.url === link)
		)
			return false
		sc.lastClip = link
		return await showTrack(link)
	} catch (error) {
		console.warn(`${TAG} clipboard check failed:`, String(error))
		return false
	}
}
