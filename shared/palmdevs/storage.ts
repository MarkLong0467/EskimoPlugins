/** The plugin's JSON storage, as far as these helpers use it. */
interface JsonStorage<T> {
	cache?: Partial<T>
	set(value: Partial<T>, replace?: boolean): unknown
}

/** Whether something is a plain object (not an array or null). */
const isPlain = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value)

/** A change to the settings: any setting, and for a setting that is an object, only the keys that change. */
export type Patch<T> = {
	[K in keyof T]?: T[K] extends readonly unknown[] | null | undefined
		? T[K]
		: T[K] extends object
			? Partial<T[K]>
			: T[K]
}

/** What {@link createStore} gives back. */
export interface Store<T extends object> {
	/** Hands over the JSON storage Valenced gives the plugin. Called when the plugin starts and when the settings open. */
	attach(next: unknown): void
	/** Reads one setting: the saved value, or the default if nothing is saved. */
	get<K extends keyof T>(key: K): T[K]
	/** Saves some settings. Objects are merged into what is saved, arrays are replaced. */
	set(patch: Patch<T>): void
	/** Saves a whole setting in place of the old one, so keys that are not in it are removed. */
	replace<K extends keyof T>(key: K, value: T[K]): void
	/** Calls `fn` whenever a setting is saved here. Returns what stops it. */
	subscribe(fn: () => void): () => void
	/** Forgets everyone who listens. Used when the plugin stops. */
	clear(): void
}

/**
 * Keeps a plugin's settings with their defaults.
 *
 * Revenge's `storage` is changed in place and read back at once. Valenced's JSON storage saves in the background and merges
 * objects, so this keeps what was just written in `pending` until the storage has it, and writes whole settings when a key
 * has to be removed.
 */
export function createStore<T extends object>(defaults: T): Store<T> {
	let storage: JsonStorage<T> | undefined
	const listeners = new Set<() => void>()
	/** What was written and may not be in the storage's cache yet. */
	const pending: Partial<T> = {}

	const notify = () => {
		for (const fn of [...listeners]) {
			try {
				fn()
			} catch {
				// A screen that is gone must not stop the others.
			}
		}
	}

	return {
		attach(next) {
			storage = next as JsonStorage<T>
		},
		get(key) {
			const saved = key in pending ? pending[key] : storage?.cache?.[key]
			if (saved === undefined) return defaults[key]
			const fallback = defaults[key]
			// A setting that is an object keeps the defaults of the keys that were never saved.
			if (isPlain(saved) && isPlain(fallback))
				return { ...fallback, ...saved } as T[typeof key]
			return saved as T[typeof key]
		},
		set(patch) {
			for (const key of Object.keys(patch) as Array<keyof T>) {
				const value = patch[key]
				const current = key in pending ? pending[key] : storage?.cache?.[key]
				pending[key] =
					value && typeof value === 'object' && !Array.isArray(value)
						? ({ ...(current as object), ...(value as object) } as T[keyof T])
						: (value as T[keyof T])
			}
			try {
				storage?.set(patch as Partial<T>)
			} catch {
				// Nothing can be saved before the storage is there.
			}
			notify()
		},
		replace(key, value) {
			pending[key] = value
			try {
				storage?.set(
					{ ...(storage.cache ?? {}), [key]: value } as Partial<T>,
					true,
				)
			} catch {
				// Nothing can be saved before the storage is there.
			}
			notify()
		},
		subscribe(fn) {
			listeners.add(fn)
			return () => {
				listeners.delete(fn)
			}
		},
		clear() {
			listeners.clear()
			for (const key of Object.keys(pending)) delete pending[key as keyof T]
		},
	}
}
