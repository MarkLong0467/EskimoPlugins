/**
 * Better Folders, a port of fres's BetterFolders for Vendetta.
 *
 * - Hide icons: a collapsed folder shows the folder icon instead of small pictures of the servers inside (`icons.tsx`).
 * - Auto collapse: opening a folder closes the other open ones (`collapse.ts`).
 *
 * Settings are in `store.ts`.
 */

import { installAutoCollapse } from './collapse'
import { diag } from './diag'
import { installIcons } from './icons'
import Settings from './Settings'
import { resetState } from './state'
import { DEFAULT_SETTINGS, resetVersion, store, watchChanges } from './store'
import type { FolderSettings } from './store'

export default plugin<{ jsonStorage: FolderSettings }>({
	SettingsComponent: Settings,
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		cleanup(() => store.clear())
		cleanup(resetVersion)
		cleanup(resetState)
		cleanup(watchChanges())
		installIcons(cleanup)
		installAutoCollapse(cleanup)
	},
})
