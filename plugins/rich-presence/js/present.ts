import { Stores } from '@valenced/discord/flux'
import { dispatchActivity } from './activity'
import { FALLBACK_COVER, MAX_BUTTON_LABEL, RICH_VARS } from './constants'
import { artworkAsset } from './images'
import { effectiveAppId } from './profiles'
import { sc, tuning } from './scstate'
import type {
	Activity,
	Profile,
	RichPresenceSettings,
	Runtime,
	SoundCloudSettings,
	Standing,
	Track,
} from './types'

/** Whether a text is a web link. */
const isLink = (value: string | undefined): value is string =>
	!!value && /^https?:\/\//i.test(value)

/** What this part shares with the custom profiles: the variables `{sc_title}` and friends, and the timer for "From the SoundCloud track". */
const shared = globalThis as unknown as {
	eskimoVars?: Record<string, string>
	eskimoTimestamps?: { start: number; end?: number }
}

/** The track to show: what Last.fm says is playing, else the link you chose. */
export function effective(settings: SoundCloudSettings): Track | null {
	return settings.autoEnabled && sc.auto ? sc.auto : settings.current
}

/** The cover to show: the real one, else the plugin's default cover, else none. */
export function coverOf(settings: SoundCloudSettings, track: Track): string {
	return track.artwork || (settings.fallbackCover ? FALLBACK_COVER : '')
}

/** When the track ends (milliseconds), if the timer is the progress bar and the length is known. Otherwise 0. */
export function progressEnd(
	settings: SoundCloudSettings,
	track: Track,
): number {
	return settings.timerMode === 'progress' && track.duration > 0
		? track.startedAt + track.duration
		: 0
}

/** The button: its label (up to 32 characters) and where it goes. A track without a link opens a search for the song. */
export function buttonOf(
	settings: SoundCloudSettings,
	track: Track,
): { label: string; url: string } {
	const label = track.url
		? String(settings.buttonLabel || '').trim() || 'Listen on SoundCloud'
		: 'Find on SoundCloud'
	return {
		label: label.slice(0, MAX_BUTTON_LABEL),
		url: track.url || track.searchUrl || '',
	}
}

/**
 * True while another app, such as Spotify, is already showing a "Listening to" card. The presences of this plugin (each has
 * its own application id) do not count.
 */
export function otherListening(settings: RichPresenceSettings): boolean {
	try {
		const store = (
			Stores as unknown as {
				LocalActivityStore?: {
					getActivities?: () => Array<{
						type?: number
						name?: string
						application_id?: unknown
					}>
				}
			}
		).LocalActivityStore
		const list = store?.getActivities?.() || []
		const own = new Set(settings.profiles.map(effectiveAppId))
		return list.some(a => {
			const id = String(a?.application_id || '')
			return (
				a &&
				a.type === 2 &&
				a.name !== 'SoundCloud' &&
				id !== '0' &&
				!own.has(id)
			)
		})
	} catch {
		return false
	}
}

/** Says why the SoundCloud profile has nothing to show right now, or nothing if it has a track to show. */
export function soundCloudProblem(
	settings: RichPresenceSettings,
	now = Date.now(),
): Standing | undefined {
	const s = settings.soundcloud
	const track = effective(s)
	if (!track) return 'waiting for a track'
	if (s.hideWithSpotify && otherListening(settings)) return 'hidden by spotify'
	const end = progressEnd(s, track)
	if (s.clearAtEnd && end && now >= end) return 'track finished'
	return undefined
}

/**
 * Builds the activity Discord expects from a track.
 *
 * "Listening to" shows the app name, the artist or the title, as the settings say (the artist only if there is one). The
 * timer is the progress bar, the time elapsed, or none. The cover and the optional small icon are hosted through Discord.
 */
export async function buildSoundCloudActivity(
	p: Profile,
	settings: SoundCloudSettings,
	track: Track,
): Promise<Activity> {
	const activity: Activity = {
		application_id: effectiveAppId(p),
		name: 'SoundCloud',
		type: 2,
		flags: 1,
		details: track.title.slice(0, 128),
	}
	const hasArtist = settings.showArtist && !!track.artist
	if (hasArtist) activity.state = track.artist.slice(0, 128)
	if (isLink(track.url)) activity.details_url = track.url
	if (hasArtist && isLink(track.artistUrl)) activity.state_url = track.artistUrl
	// 0 = the app name, 1 = the state line, 2 = the details line. Fall back to the name when the line is missing.
	let display = Number(settings.statusText) || 0
	if (display === 1 && !hasArtist) display = 0
	activity.status_display_type = display

	if (settings.timerMode === 'progress') {
		const end = progressEnd(settings, track)
		activity.timestamps = end
			? { start: track.startedAt, end }
			: { start: track.startedAt }
	} else if (settings.timerMode === 'elapsed') {
		activity.timestamps = { start: track.startedAt }
	}

	const cover = settings.showArtwork ? coverOf(settings, track) : ''
	if (cover) {
		const image = await artworkAsset(cover)
		if (image) {
			// The hover text is the album when Last.fm knows it, else the title.
			activity.assets = {
				large_image: image,
				large_text: (track.album || track.title).slice(0, 128),
			}
			if (isLink(track.url)) activity.assets.large_url = track.url
		}
	}
	// An optional small icon, such as a SoundCloud logo you pick, in the corner of the cover.
	const icon = String(settings.smallIcon || '').trim()
	if (activity.assets && isLink(icon)) {
		const smallImage = await artworkAsset(icon)
		if (smallImage) {
			activity.assets.small_image = smallImage
			activity.assets.small_text = 'SoundCloud'
		}
	}
	if (settings.showButton) {
		const button = buttonOf(settings, track)
		if (isLink(button.url)) {
			activity.buttons = [button.label]
			activity.metadata = { button_urls: [button.url] }
		}
	}
	return activity
}

/**
 * Sends the update waiting to go, if Discord's allowance (4 per 20 seconds) has room. If not, a timer sends it when the
 * oldest send has aged out; only the newest update waits.
 */
function flushSend(): void {
	if (!sc.pendingSend) return
	const now = Date.now()
	sc.sentTimes = sc.sentTimes.filter(t => now - t < tuning.rateWindow)
	if (sc.sentTimes.length >= tuning.rateMax) {
		const wait = sc.sentTimes[0] + tuning.rateWindow - now + 50
		if (!sc.sendTimer) {
			sc.sendTimer = setTimeout(() => {
				sc.sendTimer = undefined
				flushSend()
			}, wait)
		}
		return
	}
	const next = sc.pendingSend
	sc.pendingSend = undefined
	sc.lastSentJson = next.json
	sc.sentTimes.push(now)
	dispatchActivity(next.activity, next.rt)
}

/**
 * Sends the SoundCloud presence, unless it is identical to the last one, and never faster than Discord allows (4 per 20 s).
 * Only an update that follows a live one can be a repeat: after the presence was taken away, the same one is sent again.
 */
export function sendSoundCloud(activity: Activity | null, rt: Runtime): void {
	const json = JSON.stringify(activity == null ? null : activity)
	if (!sc.pendingSend && rt.live && json === sc.lastSentJson) return
	sc.pendingSend = { activity, json, rt }
	flushSend()
}

/** Drops an update that is still waiting for its turn and forgets the last one, for when the presence is taken away. */
export function dropPendingSend(): void {
	clearTimeout(sc.sendTimer)
	sc.sendTimer = undefined
	sc.pendingSend = undefined
	sc.lastSentJson = ''
}

/** Hands the track to the custom profiles: `{sc_title}`, `{sc_artist}`, `{sc_url}`, `{sc_art}`, `{sc_button}` and the timer's start and end. */
export function pushVars(settings: SoundCloudSettings, track: Track): void {
	sc.varsPushed = true
	const end = progressEnd(settings, track)
	const button = buttonOf(settings, track)
	shared.eskimoVars = Object.assign(shared.eskimoVars || {}, {
		sc_title: track.title,
		sc_artist: settings.showArtist ? track.artist : '',
		sc_url: button.url,
		sc_art: settings.showArtwork ? coverOf(settings, track) : '',
		sc_button: button.label,
	})
	shared.eskimoTimestamps =
		settings.timerMode === 'none'
			? undefined
			: end
				? { start: track.startedAt, end }
				: { start: track.startedAt }
}

/** Empties the variables, so a custom profile's "show only when" hides it while nothing plays. */
export function clearVars(): boolean {
	const vars = shared.eskimoVars
	// Only what this plugin put there is emptied; variables another plugin supplies are left alone.
	if (!sc.varsPushed || !vars || !vars.sc_title) return false
	sc.varsPushed = false
	for (const key of RICH_VARS) vars[key] = ''
	shared.eskimoTimestamps = undefined
	return true
}
