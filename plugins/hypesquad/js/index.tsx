/**
 * HypeSquad Switcher.
 *
 * The plugin's settings page lists the three HypeSquad houses. Tapping one joins it, and the row of your current house
 * shows "Current". There is also a row to leave HypeSquad.
 *
 * How it is put together:
 * - `Settings.tsx` is the settings screen, `useHouse.ts` keeps it up to date,
 * - `change.ts` joins or leaves a house and tells you how it went,
 * - `http.ts` sends the request, `explain.ts` turns a failure into a sentence,
 * - `house.ts` and `state.ts` know which house you are in (the pending change included).
 */

import Settings from './Settings'
import { resetState } from './state'

export default plugin({
	SettingsComponent: Settings,

	start({ cleanup }) {
		// A change that was still pending when the plugin stopped must not leak into the next start.
		cleanup(resetState)
	},
})
