import { DEFAULTS } from '../defaults'
import type { JsonStorage } from '@valenced/json-storage'
import type { ChatBubblesStorage } from '../types'

type RevengeJsonStorageApi<S extends object> = JsonStorage<S>

let storage: RevengeJsonStorageApi<ChatBubblesStorage> | undefined

export function setStorage(handle: RevengeJsonStorageApi<ChatBubblesStorage>) {
	storage = handle
}

export function getStorage() {
	return storage
}

export function getSettings(): ChatBubblesStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export { DEFAULTS }
