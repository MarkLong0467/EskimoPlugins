/**
 * Rich Presence.
 *
 * Shows up to three presences at once on your Discord profile, each one a profile you set up, and the SoundCloud track you
 * are listening to. Each profile that is switched on is sent to Discord as its own local activity (`LOCAL_ACTIVITY_UPDATE`),
 * under its own made-up socket and process, as a game would report it. Discord's local activity store keeps one activity for
 * each socket, so each shows on your profile. Discord's app keeps only one "Playing" and merges activities with the same
 * application id, so each profile has its own Application ID (one is made up when you leave it empty).
 *
 * The SoundCloud profile is a special kind: it has no fields of its own, its settings are the SoundCloud ones. Discord cannot
 * see what another app plays, so the track comes from a link you paste or copy, or from Last.fm "now playing" filled in by a
 * scrobbler app such as Pano Scrobbler.
 *
 * Other plugins and profiles can work with it:
 * - `globalThis.eskimoRichPresence.apply()` asks for the presences to be sent again,
 * - `globalThis.eskimoVars` supplies variables (the SoundCloud track is `{sc_title}` and friends),
 * - `globalThis.eskimoTimestamps` gives the start and end of the timer when a profile's timer is "From the SoundCloud track".
 *
 * How it is put together:
 * - `activity.ts` builds the activity of one profile with its timer and sends it, `images.ts` turns image links and keys into
 *   asset ids,
 * - `timers.ts` has the time rules (dates, repeats, daily ranges, schedules) without any Discord code,
 * - `apply.ts` sends every profile that is shown (one after another), takes away the ones that are not, refreshes, and watches
 *   the clock for timers that change by themselves,
 * - `profiles.ts` has the profile shape, defaults, the limit and the plan of which profiles are shown,
 * - `state.ts` keeps what each profile needs (its socket, its process and its timers), `variables.ts` fills in `{time}` and the
 *   rest,
 * - the SoundCloud part: `soundcloud.ts` (what is shown and the actions), `present.ts` (builds and sends its presence within
 *   Discord's limits), `lastfm.ts` (follows Last.fm), `lookup.ts` (reads a pasted link), `scstate.ts`, `format.ts`,
 * - `constants.ts` and `types.ts` hold fixed values and types,
 * - `Settings.tsx` is the settings screen (`Preview.tsx` the live preview, `Field.tsx` a text box that saves when typing
 *   pauses).
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { AppState } from 'react-native'
import {
	applyAll,
	clearAll,
	ensureWatcher,
	restartRefresh,
	scheduleApply,
} from './apply'
import {
	CLIPBOARD_AT_START_MS,
	CLIPBOARD_ON_RETURN_MS,
	RECONNECT_DELAY_MS,
	SPOTIFY_DELAY_MS,
} from './constants'
import { diag } from './diag'
import { poll } from './lastfm'
import { DEFAULT_SETTINGS } from './profiles'
import Settings from './Settings'
import { sc } from './scstate'
import { checkClipboard, refreshSoundCloud, syncSoundCloud } from './soundcloud'
import { forgetRuntimes, read, setStorage, state } from './state'
import { markAppStart } from './timers'
import type { RichPresenceSettings } from './types'

/** What other plugins can call. */
const richApi = { apply: () => scheduleApply(false) }

const shared = globalThis as unknown as { eskimoRichPresence?: typeof richApi }

export default plugin<{ jsonStorage: RichPresenceSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorage(jsonStorage)
		markAppStart()
		shared.eskimoRichPresence = richApi
		state.active = true
		sc.auto = null

		cleanup(() => {
			state.active = false
			clearTimeout(state.applyTimer)
			clearInterval(state.refreshTimer)
			clearInterval(state.loopTimer)
			clearTimeout(sc.endTimer)
			clearInterval(sc.pollTimer)
			clearTimeout(sc.endPollTimer)
			clearTimeout(sc.missTimer)
			sc.missPending = false
			state.pending.clear()
			state.pendingAll = false
			try {
				clearAll()
			} catch {
				// Discord is already shutting down.
			}
			forgetRuntimes()
			if (shared.eskimoRichPresence === richApi)
				shared.eskimoRichPresence = undefined
		})

		// Wait for the saved settings, then start the watcher and the refresh timer and, if asked, send the presences.
		Promise.resolve(jsonStorage.cache || jsonStorage.get()).then(() => {
			if (!state.active) return
			ensureWatcher()
			restartRefresh()
			if (read().applyOnStart) applyAll(true)
			syncSoundCloud()
			if (read().soundcloud.clipboardOnOpen)
				setTimeout(() => checkClipboard(true), CLIPBOARD_AT_START_MS)
		})

		// Opening Discord again checks the clipboard (if you asked for that) and Last.fm.
		try {
			const sub = AppState.addEventListener('change', appState => {
				if (appState !== 'active') return
				const s = read().soundcloud
				if (s.clipboardOnOpen)
					setTimeout(() => checkClipboard(true), CLIPBOARD_ON_RETURN_MS)
				if (s.autoEnabled) poll()
			})
			cleanup(() => {
				try {
					sub.remove()
				} catch {
					// Already removed.
				}
			})
		} catch {
			// This phone does not report the app coming back.
		}

		// Discord drops local activities on reconnect, so every presence has to be sent again.
		cleanup(
			onFluxEventDispatched('CONNECTION_OPEN', payload => {
				sc.lastSentJson = ''
				setTimeout(() => applyAll(false), RECONNECT_DELAY_MS)
				return payload
			}),
		)

		// Spotify starting or stopping decides whether the SoundCloud presence steps aside.
		for (const name of ['SPOTIFY_PLAYER_STATE', 'SPOTIFY_PLAYER_PLAY']) {
			try {
				cleanup(
					onFluxEventDispatched(name, payload => {
						if (read().soundcloud.hideWithSpotify)
							setTimeout(() => refreshSoundCloud(), SPOTIFY_DELAY_MS)
						return payload
					}),
				)
			} catch {
				// This event is not available.
			}
		}
	},
})
