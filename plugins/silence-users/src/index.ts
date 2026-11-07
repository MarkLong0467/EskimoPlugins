/**
 * Silence Users, a port of SilenceUsers for Equicord (by dka, GPL-3.0).
 *
 * It takes the pings out of messages from people you choose before Discord counts them, so they add nothing to the server
 * badge and make no pop-up. The messages themselves are untouched. Extras: silence everyone's pings, `@everyone` and `@here`,
 * or role pings, add people with `/silence`, and a list in the settings with a recent pingers list.
 *
 * Parts: `filter.ts` is the logic, `flux.ts` hooks it into Discord's events, `list.ts` and `people.ts` are the list of people
 * and who they are, `command.ts` is `/silence`, `Settings.tsx` is the screen, `diag.ts` is the report.
 */

import { installCommand } from './command'
import { diag } from './diag'
import { installFlux } from './flux'
import { toggleSilenced } from './list'
import Settings from './Settings'
import { resetState } from './state'
import { DEFAULT_SETTINGS, store } from './store'
import type { Settings as SilenceSettings } from './store'

export default plugin<{ jsonStorage: SilenceSettings }>({
	SettingsComponent: Settings,
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		cleanup(() => store.clear())
		cleanup(resetState)
		installFlux(cleanup)
		installCommand(cleanup, info => {
			if (info.userId) toggleSilenced(info.userId)
		})
	},
})
