import { DEFAULTS } from '../defaults'
import type { JsonStorage } from '@valenced/json-storage'
import type { AltMasterStorage } from '../types'

let storage: JsonStorage<AltMasterStorage> | undefined

export function setStorage(handle: JsonStorage<AltMasterStorage>) {
	storage = handle
}

export function getStorage() {
	return storage
}

// storage.cache is plain data; storage.use() is a React hook and throws
// "Invalid hook call" inside patched renderers.
export function getSettings(): AltMasterStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}
