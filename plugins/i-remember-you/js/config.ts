import { createStore } from '../../../shared/palmdevs/storage'
import type { UsersCollection } from './data'

/** What the plugin saves. */
export interface RememberSettings {
	/** Everyone remembered, by server (`dm` for people met outside a server). Equicord keeps this as `irememberyou.data`. */
	data: UsersCollection
}

/** What is saved until the plugin has remembered someone. */
export const DEFAULT_SETTINGS: RememberSettings = {
	data: {},
}

/** The plugin's saved data. */
export const store = createStore<RememberSettings>(DEFAULT_SETTINGS)
