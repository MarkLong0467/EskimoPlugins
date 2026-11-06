import { DEFAULTS } from '../defaults'
import { flushThemeCaches } from './flush'
import type { JsonStorage } from '@valenced/json-storage'
import type { MaterialCordSettings } from '../types'

let storage: JsonStorage<MaterialCordSettings> | undefined
let snapshot: MaterialCordSettings = { ...DEFAULTS }
/**
 * Mirror of the last write. `storage.set()` lands asynchronously, so without
 * this the overlay would run on the previous settings for a frame or two.
 */
let lastWrite: MaterialCordSettings | undefined
const listeners = new Set<() => void>()

export function setStorage(handle: JsonStorage<MaterialCordSettings>) {
	storage = handle
	lastWrite = undefined
	snapshot = getSettings()
}

export function getSettings(): MaterialCordSettings {
	return { ...DEFAULTS, ...(storage?.cache ?? {}), ...(lastWrite ?? {}) }
}

export function setSettings(patch: Partial<MaterialCordSettings>): void {
	const current = getSettings()
	const next = { ...current, ...patch }
	lastWrite = next
	snapshot = next
	// Tint changes only become visible after the theme caches forget the old
	// key, so a palette edit always costs one flush.
	if (next.enabled !== current.enabled || next.seed !== current.seed) {
		flushThemeCaches()
	}
	emit()
	storage?.set(next)
}

export function getSettingsSnapshot(): MaterialCordSettings {
	return snapshot
}

export function subscribeSettings(cb: () => void): () => void {
	listeners.add(cb)
	return () => {
		listeners.delete(cb)
	}
}

export function notifySettings(): void {
	snapshot = getSettings()
	emit()
}

function emit(): void {
	for (const cb of [...listeners]) {
		try {
			cb()
		} catch {
			// one broken subscriber must not stop the rest
		}
	}
}
