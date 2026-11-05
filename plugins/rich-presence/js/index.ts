/**
 * Rich Presence.
 *
 * Sets a custom Discord presence ("Playing ...", "Listening to ...") from profiles you write in the settings: text with
 * variables, images from links or asset keys, a timer, a party size and up to two buttons, with a live preview.
 *
 * The presence is sent as a local activity (`LOCAL_ACTIVITY_UPDATE`) under a made-up process, as a game would report it.
 *
 * Other plugins can work with it:
 * - `globalThis.eskimoRichPresence.apply()` asks for the presence to be sent again,
 * - `globalThis.eskimoVars` adds variables (SoundCloud Presence provides `{sc_title}` and friends),
 * - `globalThis.eskimoTimestamps` gives the start and end of the timer when a profile's timer is "From another plugin".
 *
 * How it is put together:
 * - `activity.ts` builds the activity from a profile and sends it, `images.ts` turns image links and keys into asset ids,
 * - `apply.ts` applies on a schedule, refreshes and loops the timer, `variables.ts` fills in `{time}` and the rest,
 * - `profiles.ts` has the profile shape and defaults, `state.ts` and `constants.ts` hold shared state and values,
 * - `Settings.tsx` is the settings screen (`Preview.tsx` the live preview, `Field.tsx` a text box that saves when
 *   typing pauses).
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { dispatchActivity } from './activity'
import { apply, restartRefresh, scheduleApply } from './apply'
import { RECONNECT_DELAY_MS } from './constants'
import { DEFAULT_SETTINGS } from './profiles'
import Settings from './Settings'
import { read, setStorage, state } from './state'
import type { RichPresenceSettings } from './types'

/** What other plugins can call. */
const richApi = { apply: () => scheduleApply(false) }

const shared = globalThis as unknown as { eskimoRichPresence?: typeof richApi }

export default plugin<{ jsonStorage: RichPresenceSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)
		shared.eskimoRichPresence = richApi
		state.active = true
		state.appliedAt = Date.now()

		cleanup(() => {
			state.active = false
			clearTimeout(state.applyTimer)
			clearInterval(state.refreshTimer)
			clearInterval(state.loopTimer)
			try {
				dispatchActivity(null)
			} catch {
				// Discord is already shutting down.
			}
			if (shared.eskimoRichPresence === richApi)
				shared.eskimoRichPresence = undefined
		})

		// Wait for the saved settings, then start the refresh timer and, if asked, send the presence.
		Promise.resolve(jsonStorage.cache || jsonStorage.get()).then(() => {
			if (!state.active) return
			restartRefresh()
			if (read().applyOnStart) apply(true)
		})

		// Discord drops local activities on reconnect.
		cleanup(
			onFluxEventDispatched('CONNECTION_OPEN', payload => {
				setTimeout(() => apply(false), RECONNECT_DELAY_MS)
				return payload
			}),
		)
	},
})
