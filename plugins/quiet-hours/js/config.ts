import { DEFAULT_SETTINGS } from './constants'
import type { QuietSettings } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
interface Storage {
	cache?: Partial<QuietSettings>
	set(value: Partial<QuietSettings>, replace?: boolean): unknown
}

let storage: Storage | undefined

/** Remembers the storage to read settings from. */
export function setStorage(next: unknown): void {
	storage = next as Storage
}

/** Whether the storage has been handed over yet. */
export function ready(): boolean {
	return storage !== undefined
}

/** Reads one setting: the saved value, or the default if nothing is saved. */
export function setting<K extends keyof QuietSettings>(
	key: K,
): QuietSettings[K] {
	const saved = storage?.cache?.[key]
	return saved !== undefined
		? (saved as QuietSettings[K])
		: DEFAULT_SETTINGS[key]
}

/** The seven day switches, always seven entries even if what is saved is damaged. */
export function daysSetting(): boolean[] {
	const saved = setting('days')
	return Array.isArray(saved) && saved.length === 7
		? saved.map(Boolean)
		: [...DEFAULT_SETTINGS.days]
}

/** Who wants to know when a setting is saved here. */
const listeners = new Set<() => void>()

/** Calls `fn` whenever a setting is saved through {@link saveSettings}. Returns what stops it. */
export function subscribe(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}

/** Forgets everyone who listens. Used when the plugin stops. */
export function clearListeners(): void {
	listeners.clear()
}

/** Saves some settings and tells the listeners. */
export function saveSettings(patch: Partial<QuietSettings>): void {
	try {
		storage?.set(patch)
	} catch {
		// Nothing can be saved before the storage is there.
	}
	for (const fn of [...listeners]) {
		try {
			fn()
		} catch {
			// A screen that is gone must not stop the others.
		}
	}
}
