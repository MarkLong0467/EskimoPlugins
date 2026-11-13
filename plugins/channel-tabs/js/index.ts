/**
 * Channel Tabs.
 *
 * Keeps channels, DMs, threads and forum posts open as tabs on a bar above (or beside) the chat, like the tabs of a browser:
 * tap one to switch to it, ✕ to close it, ✕ all to close every one. Hold a tab, or tap Split, to see two of them at once.
 *
 * How it is put together:
 * - `frame.tsx` puts the bar and the optional second screen around Discord's channel screen,
 * - `TabBar.tsx` is the bar, `tabs.ts` is what its buttons do,
 * - `discord.ts` is the small layer over Discord's stores and navigation, `config.ts` is what is saved.
 */

import { DEFAULT_SETTINGS, store } from './config'
import { diag } from './diag'
import { installFrame } from './frame'
import Settings from './Settings'
import { resetState } from './state'
import type { TabsSettings } from './config'

export default plugin<{ jsonStorage: TabsSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		// A split does not last from one session to the next.
		store.set({ split: null })
		cleanup(() => {
			store.clear()
			resetState()
		})
		installFrame(cleanup)
		diag.log('plugin', 'started')
	},
})
