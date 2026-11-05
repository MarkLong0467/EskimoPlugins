import { RICH_VARS } from './constants'
import { buttonOf, coverOf, progressEnd } from './present'
import { state, toast } from './state'
import type { SoundCloudSettings, Track } from './types'

/** What the Rich Presence plugin exposes and what this plugin shares with it. */
const shared = globalThis as unknown as {
	eskimoRichPresence?: { apply?: () => void }
	eskimoVars?: Record<string, string>
	eskimoTimestamps?: { start: number; end?: number }
}

/** Asks the Rich Presence plugin to send its presence again. False if it is not running. */
function nudgeRich(): boolean {
	const rp = shared.eskimoRichPresence
	if (rp && typeof rp.apply === 'function') {
		rp.apply()
		return true
	}
	return false
}

/**
 * Hands the track to the Rich Presence plugin: the variables `{sc_title}`, `{sc_artist}`, `{sc_url}`, `{sc_art}` and
 * `{sc_button}`, and the timer's start and end. If Rich Presence is not running, the person is told once.
 */
export function pushRich(settings: SoundCloudSettings, track: Track): void {
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
	if (!nudgeRich() && !state.richWarned) {
		state.richWarned = true
		toast('Rich Presence 1.3 or newer is not running, so nothing is shown')
	}
}

/** Empties the variables shared with Rich Presence, so its "show only when" hides the presence. */
export function clearRich(): void {
	const vars = shared.eskimoVars
	if (!vars || !vars.sc_title) return
	for (const key of RICH_VARS) vars[key] = ''
	shared.eskimoTimestamps = undefined
	nudgeRich()
}
