import { DEFAULT_SETTINGS } from './constants'
import type { TextReactSettings } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
let storage: { cache?: Partial<TextReactSettings> } | undefined

/** Remembers the storage to read settings from. */
export function setStorage(next: unknown): void {
	storage = next as typeof storage
}

/** Reads one setting: the saved value, or the default if nothing is saved. */
export function setting<K extends keyof TextReactSettings>(
	key: K,
): TextReactSettings[K] {
	const saved = storage?.cache?.[key]
	return saved !== undefined
		? (saved as TextReactSettings[K])
		: DEFAULT_SETTINGS[key]
}

/** The pause between two reactions in milliseconds, from the setting (at least a third of a second). */
export function delayMs(): number {
	const seconds = Number(setting('delaySeconds'))
	return Math.max(
		300,
		Math.round((Number.isFinite(seconds) ? seconds : 1) * 1000),
	)
}
