import { DEFAULT_SETTINGS } from './constants'
import type { ReminderSettings } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
interface Storage {
	cache?: Partial<ReminderSettings>
	set(value: Partial<ReminderSettings>, replace?: boolean): unknown
}

let storage: Storage | undefined

/** Remembers the storage to read settings from. */
export function setStorage(next: unknown): void {
	storage = next as Storage
}

/** The storage, if the plugin has started. */
export function getStorage(): Storage | undefined {
	return storage
}

/** Reads one setting: the saved value, or the default if nothing is saved. */
export function setting<K extends keyof ReminderSettings>(
	key: K,
): ReminderSettings[K] {
	const saved = storage?.cache?.[key]
	return saved !== undefined
		? (saved as ReminderSettings[K])
		: DEFAULT_SETTINGS[key]
}

/** Saves some settings. */
export function saveSettings(patch: Partial<ReminderSettings>): void {
	try {
		storage?.set(patch)
	} catch {
		// Nothing can be saved before the storage is there.
	}
}
