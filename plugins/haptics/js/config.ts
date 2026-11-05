import { DEFAULT_SETTINGS } from './constants'
import type { HapticsSettings } from './types'

/**
 * The plugin's JSON storage. It is handed over when the plugin starts and again when the settings screen opens, and is
 * read through `setting` every time a buzz goes by, so a switch takes effect right away.
 */
let storage: { cache?: Partial<HapticsSettings> | object } | undefined

/** Remembers the storage to read settings from. */
export function setStorage(next: typeof storage): void {
	storage = next
}

/** Reads one setting: the saved value, or the default if nothing is saved (or nothing is loaded yet). */
export function setting<K extends keyof HapticsSettings>(
	key: K,
): HapticsSettings[K] {
	const saved = storage?.cache as Partial<HapticsSettings> | undefined
	return saved && saved[key] !== undefined
		? (saved[key] as HapticsSettings[K])
		: DEFAULT_SETTINGS[key]
}
