import { DEFAULT_SETTINGS } from './constants'
import type { ColorfulChannelsSettings } from './types'

/**
 * The plugin's JSON storage. It is handed over when the plugin starts and again when the settings screen opens, and
 * is read through `setting` whenever an icon or channel name is drawn, so a changed setting applies the next time
 * the channel list is drawn.
 */
let storage: { cache?: Partial<ColorfulChannelsSettings> | object } | undefined

/** Remembers the storage to read settings from. */
export function setStorage(next: typeof storage): void {
	storage = next
}

/** Reads one setting: the saved value, or the default if nothing is saved (or nothing is loaded yet). */
export function setting<K extends keyof ColorfulChannelsSettings>(
	key: K,
): ColorfulChannelsSettings[K] {
	const saved = storage?.cache as Partial<ColorfulChannelsSettings> | undefined
	return saved && saved[key] !== undefined
		? (saved[key] as ColorfulChannelsSettings[K])
		: DEFAULT_SETTINGS[key]
}
