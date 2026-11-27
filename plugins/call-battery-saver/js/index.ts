/**
 * Call Battery Saver.
 *
 * Uses less battery in voice calls while you are muted or deafened. See `engine.ts` for what Discord does and what this
 * plugin changes.
 *
 * How it is put together:
 * - `engine.ts` watches the call and the mute state, and does the saving,
 * - `Settings.tsx` is the settings screen,
 * - `config.ts`, `discord.ts` and `diag.ts` are helpers.
 */

import { DEFAULT_SETTINGS, store } from './config'
import { diag } from './diag'
import { schedule, startEngine } from './engine'
import Settings from './Settings'
import type { SaverSettings } from './config'

export default plugin<{ jsonStorage: SaverSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		startEngine(cleanup)
		// A setting saved here, or saved to the storage some other way, takes effect at once.
		cleanup(store.subscribe(() => schedule(true)))
		cleanup(jsonStorage.subscribe(() => schedule(true)))
		cleanup(() => store.clear())
		diag.log('plugin', 'started')
	},
})
