import { DEFAULTS } from '../defaults'
import { kmmiioLib } from './modules'
import type { JsonStorage } from '@valenced/json-storage'
import type { DeclutterSettings } from '../types'

type RevengeJsonStorageApi<S extends object> = JsonStorage<S>

const SERVER_DRAWER_PLUGIN_ID = 'marklong.server-drawer'

let storage: RevengeJsonStorageApi<DeclutterSettings> | undefined

export function setStorage(handle: RevengeJsonStorageApi<DeclutterSettings>) {
	storage = handle
}

export function getStorage() {
	return storage
}

export function isServerDrawerRunning(): boolean {
	try {
		return kmmiioLib()?.isPluginRunning?.(SERVER_DRAWER_PLUGIN_ID) === true
	} catch {
		return false
	}
}

export function getSettings(): DeclutterSettings {
	const settings = { ...DEFAULTS, ...(storage?.cache ?? {}) }
	if (isServerDrawerRunning()) {
		settings.questDock = false
	}
	return settings
}

export function setSettings(patch: Partial<DeclutterSettings>): void {
	storage?.set({ ...getSettings(), ...patch })
}
