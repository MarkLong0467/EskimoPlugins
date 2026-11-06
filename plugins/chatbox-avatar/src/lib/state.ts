import { DEFAULTS } from '../defaults'
import type { JsonStorage } from '@valenced/json-storage'
import type { ChatboxAvatarStorage } from '../types'

type RevengeJsonStorageApi<S extends object> = JsonStorage<S>

let storage: RevengeJsonStorageApi<ChatboxAvatarStorage> | undefined

export function setStorage(
	handle: RevengeJsonStorageApi<ChatboxAvatarStorage>,
) {
	storage = handle
}

export function getStorage() {
	return storage
}

export function getSettings(): ChatboxAvatarStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}
