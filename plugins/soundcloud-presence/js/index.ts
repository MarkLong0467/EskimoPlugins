/**
 * SoundCloud Presence.
 *
 * Shows the SoundCloud track you are listening to as a "Listening to" status on your Discord profile. It sets the status
 * the same way the Rich Presence plugin does (`LOCAL_ACTIVITY_UPDATE`).
 *
 * Discord cannot see what another app is playing, so the track comes from one of two places:
 *  - a SoundCloud link you paste, pick from Recent, or copy in SoundCloud (Share > Copy link), or
 *  - Last.fm "now playing", filled in by a scrobbler app such as Pano Scrobbler, which can read the SoundCloud app's media
 *    notification. That is the automatic mode.
 *
 * The status can be shown by this plugin itself, or handed to the Rich Presence plugin as the variables {sc_title}
 * {sc_artist} {sc_url} {sc_art} {sc_button} so your own presence profile can display it.
 *
 * How it is put together:
 * - `lastfm.ts` follows Last.fm (checks, finds the length and cover), `lookup.ts` reads a pasted link,
 * - `apply.ts` puts the right status on the profile, `present.ts` builds the activity and sends it within Discord's limits,
 * - `rich.ts` hands the track to Rich Presence, `images.ts` has Discord host the cover,
 * - `Settings.tsx` is the settings screen (`Preview.tsx`, `Field.tsx`), `state.ts`, `format.ts`, `constants.ts` and `types.ts`
 *   are helpers.
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { AppState } from 'react-native'
import { apply, checkClipboard } from './apply'
import { DEFAULT_SETTINGS } from './constants'
import { poll, restartPolling } from './lastfm'
import { dispatchNow } from './present'
import { clearRich } from './rich'
import Settings from './Settings'
import { read, save, setStorage, state } from './state'
import type { SoundCloudSettings } from './types'

/** How long after opening Discord the clipboard is looked at (milliseconds). */
const CLIPBOARD_AT_START_MS = 2000
const CLIPBOARD_ON_RETURN_MS = 800

/** How long after Discord reconnects the status is sent again, and after Spotify changes it is checked (milliseconds). */
const RECONNECT_DELAY_MS = 3000
const SPOTIFY_DELAY_MS = 1500

export default plugin<{ jsonStorage: SoundCloudSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)
		state.active = true
		state.auto = null

		cleanup(() => {
			state.active = false
			clearTimeout(state.endTimer)
			clearInterval(state.pollTimer)
			clearTimeout(state.endPollTimer)
			clearTimeout(state.missTimer)
			state.missPending = false
			try {
				clearRich()
			} catch {
				// The Rich Presence plugin is already gone.
			}
			try {
				dispatchNow(null)
			} catch {
				// Discord is already shutting down.
			}
		})

		// Wait for the saved settings, then start checking and, if asked, show the last track again.
		Promise.resolve(jsonStorage.cache || jsonStorage.get()).then(async () => {
			if (!state.active) return
			if (!read().fastDefaultApplied) {
				// 0.4.0 made 10 seconds the default. Anyone still on the old 30 second default moves to it once; any other choice stays.
				const current = read()
				await save({
					fastDefaultApplied: true,
					pollSeconds:
						String(current.pollSeconds) === '30' ? '10' : current.pollSeconds,
				})
				if (!state.active) return
			}
			if (read().applyOnStart) apply()
			restartPolling()
			if (read().clipboardOnOpen)
				setTimeout(() => checkClipboard(true), CLIPBOARD_AT_START_MS)
		})

		// Opening Discord again checks the clipboard (if you asked for that) and Last.fm.
		try {
			const sub = AppState.addEventListener('change', appState => {
				if (appState !== 'active') return
				if (read().clipboardOnOpen)
					setTimeout(() => checkClipboard(true), CLIPBOARD_ON_RETURN_MS)
				if (read().autoEnabled) poll()
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

		// Discord drops local activities on reconnect, so the last one has to be sent again.
		cleanup(
			onFluxEventDispatched('CONNECTION_OPEN', payload => {
				state.lastSentJson = ''
				setTimeout(() => apply(), RECONNECT_DELAY_MS)
				return payload
			}),
		)

		// Spotify starting or stopping decides whether this status steps aside.
		for (const name of ['SPOTIFY_PLAYER_STATE', 'SPOTIFY_PLAYER_PLAY']) {
			try {
				cleanup(
					onFluxEventDispatched(name, payload => {
						if (read().hideWithSpotify)
							setTimeout(() => apply(), SPOTIFY_DELAY_MS)
						return payload
					}),
				)
			} catch {
				// This event is not available.
			}
		}
	},
})
