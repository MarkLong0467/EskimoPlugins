/**
 * CustomRPC Test.
 *
 * A test version of Rich Presence that can show several presences at once. Each profile that is switched on is sent to
 * Discord as its own local activity (`LOCAL_ACTIVITY_UPDATE`), under its own made-up socket and process, as a game would
 * report it. Discord's local activity store keeps one activity for each socket and shows all of them, so each profile
 * appears as an activity of its own on your profile.
 *
 * It uses different sockets and a different global from Rich Presence, so the two plugins can run together.
 *
 * Other plugins can work with it:
 * - `globalThis.eskimoCustomRpcTest.apply()` asks for the presences to be sent again,
 * - `globalThis.eskimoVars` supplies variables (SoundCloud Presence provides `{sc_title}` and friends),
 * - `globalThis.eskimoTimestamps` gives the start and end of the timer when a profile's timer is "From another plugin".
 *
 * How it is put together:
 * - `activity.ts` builds the activity of one profile and sends it, `images.ts` turns image links and keys into asset ids,
 * - `apply.ts` sends every profile that is shown (one after another), takes away the ones that are not, refreshes, and loops
 *   the custom timers,
 * - `state.ts` keeps what each profile needs (its socket, its process and its timers), `variables.ts` fills in `{time}` and
 *   the rest,
 * - `profiles.ts` has the profile shape, defaults and the limit, `constants.ts` and `types.ts` hold fixed values and types,
 * - `Settings.tsx` is the settings screen (`Preview.tsx` the live preview, `Field.tsx` a text box that saves when typing
 *   pauses).
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { applyAll, clearAll, restartRefresh, scheduleApply } from './apply'
import { RECONNECT_DELAY_MS } from './constants'
import { diag } from './diag'
import { DEFAULT_SETTINGS } from './profiles'
import Settings from './Settings'
import { forgetRuntimes, read, setStorage, state } from './state'
import type { RichPresenceSettings } from './types'

/** What other plugins can call. */
const richApi = { apply: () => scheduleApply(false) }

const shared = globalThis as unknown as { eskimoCustomRpcTest?: typeof richApi }

export default plugin<{ jsonStorage: RichPresenceSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorage(jsonStorage)
		shared.eskimoCustomRpcTest = richApi
		state.active = true

		cleanup(() => {
			state.active = false
			clearTimeout(state.applyTimer)
			clearInterval(state.refreshTimer)
			clearInterval(state.loopTimer)
			state.pending.clear()
			state.pendingAll = false
			try {
				clearAll()
			} catch {
				// Discord is already shutting down.
			}
			forgetRuntimes()
			if (shared.eskimoCustomRpcTest === richApi)
				shared.eskimoCustomRpcTest = undefined
		})

		// Wait for the saved settings, then start the refresh timer and, if asked, send the presence.
		Promise.resolve(jsonStorage.cache || jsonStorage.get()).then(() => {
			if (!state.active) return
			restartRefresh()
			if (read().applyOnStart) applyAll(true)
		})

		// Discord drops local activities on reconnect.
		cleanup(
			onFluxEventDispatched('CONNECTION_OPEN', payload => {
				setTimeout(() => applyAll(false), RECONNECT_DELAY_MS)
				return payload
			}),
		)
	},
})
