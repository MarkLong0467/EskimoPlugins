import { DEFAULT_SETTINGS } from './constants'
import type { PostSettings } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
interface Storage {
	cache?: Partial<PostSettings>
	set(value: Partial<PostSettings>, replace?: boolean): unknown
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
export function setting<K extends keyof PostSettings>(key: K): PostSettings[K] {
	const saved = storage?.cache?.[key]
	return saved !== undefined
		? (saved as PostSettings[K])
		: DEFAULT_SETTINGS[key]
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
export function saveSettings(patch: Partial<PostSettings>): void {
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
