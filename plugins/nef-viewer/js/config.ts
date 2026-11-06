import { DEFAULT_SETTINGS } from './constants'
import type { RawViewerSettings } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
let storage: { cache?: Partial<RawViewerSettings> } | undefined

/** Remembers the storage to read settings from. */
export function setStorage(next: unknown): void {
	storage = next as typeof storage
}

/** Reads one setting: the saved value, or the default if nothing is saved. */
export function setting<K extends keyof RawViewerSettings>(
	key: K,
): RawViewerSettings[K] {
	const saved = storage?.cache?.[key]
	return saved !== undefined
		? (saved as RawViewerSettings[K])
		: DEFAULT_SETTINGS[key]
}
