import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { FALLBACK_COVER, PID, SOCKET } from './constants'
import { artworkAsset } from './images'
import { state, tuning } from './state'
import type { Activity, SoundCloudSettings, Track } from './types'

/** Whether a text is a web link. */
const isLink = (value: string | undefined): value is string =>
	!!value && /^https?:\/\//i.test(value)

/** The track to show: what Last.fm says is playing, else the link you chose. */
export function effective(settings: SoundCloudSettings): Track | null {
	return settings.autoEnabled && state.auto ? state.auto : settings.current
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
	return { label: label.slice(0, 32), url: track.url || track.searchUrl || '' }
}

/**
 * Builds the activity Discord expects from a track.
 *
 * "Listening to" shows the app name, the artist or the title, as the settings say (the artist only if there is one). The
 * timer is the progress bar, the time elapsed, or none. The cover and the optional small icon are hosted through Discord.
 */
export async function buildActivity(
	settings: SoundCloudSettings,
	track: Track,
): Promise<Activity> {
	const activity: Activity = {
		application_id: '0',
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

/** Sends an activity to Discord as if a game had reported it. `null` removes the status. */
function sendActivity(activity: Activity | null): void {
	Dispatcher.dispatch({
		type: 'LOCAL_ACTIVITY_UPDATE',
		activity,
		pid: PID,
		socketId: SOCKET,
	} as never)
}

/**
 * Sends the update waiting to go, if Discord's allowance (4 per 20 seconds) has room. If not, a timer sends it when the
 * oldest send has aged out; only the newest update waits.
 */
function flushSend(): void {
	if (!state.pendingSend) return
	const now = Date.now()
	state.sentTimes = state.sentTimes.filter(t => now - t < tuning.rateWindow)
	if (state.sentTimes.length >= tuning.rateMax) {
		const wait = state.sentTimes[0] + tuning.rateWindow - now + 50
		if (!state.sendTimer) {
			state.sendTimer = setTimeout(() => {
				state.sendTimer = undefined
				flushSend()
			}, wait)
		}
		return
	}
	const next = state.pendingSend
	state.pendingSend = undefined
	state.lastSentJson = next.json
	state.sentTimes.push(now)
	sendActivity(next.activity)
}

/** Sends a status update, unless it is identical to the last one, and never faster than Discord allows (4 per 20 s). */
export function dispatchActivity(activity: Activity | null): void {
	const json = JSON.stringify(activity == null ? null : activity)
	if (!state.pendingSend && json === state.lastSentJson) return
	state.pendingSend = { activity, json }
	flushSend()
}

/** Sends right away, for shutting down and for Discord reconnecting. */
export function dispatchNow(activity: Activity | null): void {
	clearTimeout(state.sendTimer)
	state.sendTimer = undefined
	state.pendingSend = undefined
	state.lastSentJson = JSON.stringify(activity == null ? null : activity)
	state.sentTimes.push(Date.now())
	sendActivity(activity)
}

/** True while another app, such as Spotify, is already showing a "Listening to" card. */
export function otherListening(): boolean {
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
		return list.some(
			a =>
				a &&
				a.type === 2 &&
				a.name !== 'SoundCloud' &&
				String(a.application_id || '') !== '0',
		)
	} catch {
		return false
	}
}
