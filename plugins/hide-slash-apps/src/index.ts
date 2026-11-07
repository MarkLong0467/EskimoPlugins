/**
 * Hide Slash Apps.
 *
 * Press and hold an app's picture in the `/` menu to hide that app everywhere, or only in the server you are in. For bots such
 * as MEE6 that sit in many servers and cannot be removed from Discord's own settings.
 *
 * Two parts: `filter.ts` takes hidden apps out of what the `/` menu's hooks return, and `menu.tsx` adds the long press and
 * `sheet.tsx` is the menu it opens. The hidden lists are in `store.ts`.
 */

import { diag } from './diag'
import { installFilter } from './filter'
import { installMenu } from './menu'
import Settings from './Settings'
import { resetState } from './state'
import { DEFAULT_SETTINGS, resetRevision, store } from './store'
import type { HideSettings } from './store'

export default plugin<{ jsonStorage: HideSettings }>({
	SettingsComponent: Settings,
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		cleanup(() => store.clear())
		cleanup(resetRevision)
		cleanup(resetState)
		installFilter(cleanup)
		installMenu(cleanup)
	},
})
