import { DEFAULTS } from '../defaults'
import type { JsonStorage } from '@valenced/json-storage'
import type { ToastApiSettings } from '../types'

let storage: JsonStorage<ToastApiSettings> | undefined
let snapshot: ToastApiSettings = { ...DEFAULTS }
/**
 * Mirror of the last write. `storage.set()` lands asynchronously, so without
 * this a sheet would render the previous value for a frame or two.
 */
let lastWrite: ToastApiSettings | undefined
const listeners = new Set<() => void>()

export function setStorage(handle: JsonStorage<ToastApiSettings>) {
	storage = handle
	lastWrite = undefined
	snapshot = getSettings()
}

export function getSettings(): ToastApiSettings {
	return { ...DEFAULTS, ...(storage?.cache ?? {}), ...(lastWrite ?? {}) }
}

export function setSettings(patch: Partial<ToastApiSettings>): void {
	const next = { ...getSettings(), ...patch }
	lastWrite = next
	snapshot = next
	emit()
	storage?.set(next)
	// Re-read once the cache has caught up, in case the handle normalised anything.
	setTimeout(notifySettings, 0)
}

/** React snapshot. Rebuilt whenever `notifySettings()` runs. */
export function getSettingsSnapshot(): ToastApiSettings {
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
			// a broken subscriber must not stop the rest
		}
	}
}
