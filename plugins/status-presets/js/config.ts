import { DEFAULT_SETTINGS } from './constants'
import type { PresetSettings } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
let storage:
	| {
			cache?: Partial<PresetSettings>
			set?: (patch: Partial<PresetSettings>) => unknown
	  }
	| undefined

/** Functions that redraw the settings screen. Each open screen adds one. */
let screenListeners: Array<() => void> = []

/** Remembers the storage to read settings from. */
export function setStorage(next: unknown): void {
	storage = next as typeof storage
}

/** Draws every open settings screen again. */
export function redrawSettings(): void {
	for (const redraw of screenListeners.slice()) {
		try {
			redraw()
		} catch {
			// A screen that is gone cannot be redrawn.
		}
	}
}

/** Registers a screen to be redrawn when settings or the log change. Returns the function that unregisters it. */
export function listenToSettings(redraw: () => void): () => void {
	screenListeners.push(redraw)
	return () => {
		screenListeners = screenListeners.filter(listener => listener !== redraw)
	}
}

/** Forgets every screen. Used when the plugin stops. */
export function clearListeners(): void {
	screenListeners = []
}

/** Reads one setting: the saved value, or the default if nothing is saved. */
export function setting<K extends keyof PresetSettings>(
	key: K,
): PresetSettings[K] {
	const saved = storage?.cache?.[key]
	return saved !== undefined
		? (saved as PresetSettings[K])
		: DEFAULT_SETTINGS[key]
}

/** Saves some settings, updates the copy in memory straight away, and redraws the settings screens. */
export function saveSettings(patch: Partial<PresetSettings>): void {
	try {
		if (storage && typeof storage.set === 'function') storage.set(patch)
	} catch {
		// The copy in memory below is still updated.
	}
	try {
		if (storage?.cache) Object.assign(storage.cache, patch)
	} catch {
		// The cache is read-only in this case.
	}
	redrawSettings()
}
