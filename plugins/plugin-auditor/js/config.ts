import { DEFAULT_SETTINGS } from './constants'
import type { AuditorSettings } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
interface Storage {
	cache?: Partial<AuditorSettings>
	set(value: Partial<AuditorSettings>, replace?: boolean): unknown
}

let storage: Storage | undefined

/** Remembers the storage to read settings from. */
export function setStorage(next: unknown): void {
	storage = next as Storage
}

/** Reads one setting: the saved value, or the default if nothing is saved. */
export function setting<K extends keyof AuditorSettings>(
	key: K,
): AuditorSettings[K] {
	const saved = storage?.cache?.[key]
	return saved !== undefined
		? (saved as AuditorSettings[K])
		: DEFAULT_SETTINGS[key]
}

/** Saves some settings. Objects are merged into what is saved: use {@link replaceMap} to take a key away. */
export function saveSettings(patch: Partial<AuditorSettings>): void {
	try {
		storage?.set(patch)
	} catch {
		// Nothing can be saved before the storage is there.
	}
}

/**
 * Saves a whole map setting, so keys that are not in it any more are gone. The storage merges objects, so a key can only
 * be removed by saving everything again with the replace flag.
 */
export function replaceMap<K extends 'whitelist' | 'ignored' | 'vtCache'>(
	key: K,
	value: AuditorSettings[K],
): void {
	try {
		const all: AuditorSettings = {
			...DEFAULT_SETTINGS,
			...(storage?.cache ?? {}),
		}
		all[key] = value
		storage?.set(all, true)
	} catch {
		// Nothing can be saved before the storage is there.
	}
}
