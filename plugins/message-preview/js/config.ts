import { DEFAULT_SETTINGS } from './constants'
import type { PreviewSettings } from './types'

/**
 * The plugin's JSON storage. It is handed over when the plugin starts and again when the settings screen opens, and is
 * read through `setting` every time it is needed, so a change takes effect right away.
 */
let storage: { cache?: Partial<PreviewSettings> | object } | undefined

/** Remembers the storage to read settings from. */
export function setStorage(next: typeof storage): void {
	storage = next
}

/** Reads one setting: the saved value, or the default if nothing is saved (or nothing is loaded yet). */
export function setting<K extends keyof PreviewSettings>(
	key: K,
): PreviewSettings[K] {
	const saved = storage?.cache as Partial<PreviewSettings> | undefined
	return (saved?.[key] || DEFAULT_SETTINGS[key]) as PreviewSettings[K]
}
