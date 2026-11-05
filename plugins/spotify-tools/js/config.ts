import type { SpotifySettings } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
let storage: { cache?: Partial<SpotifySettings> } | undefined

/** Remembers the storage to read settings from. */
export function setStorage(next: unknown): void {
	storage = next as typeof storage
}

/** A switch that is on unless it was turned off. */
export function enabled(key: keyof SpotifySettings): boolean {
	const saved = storage?.cache
	return !saved || saved[key] !== false
}
