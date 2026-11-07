import { createStore } from '../../../shared/palmdevs/storage'

/** What the plugin saves. Both start off, like the original. */
export interface FolderSettings {
	/** Collapsed folders show the folder icon instead of small pictures of the servers inside. */
	hideIcons: boolean
	/** Opening a folder closes the other open ones. */
	autoCollapse: boolean
}

export const DEFAULT_SETTINGS: FolderSettings = {
	hideIcons: false,
	autoCollapse: false,
}

/** The plugin's settings. */
export const store = createStore<FolderSettings>(DEFAULT_SETTINGS)

/** Counts every change, so a drawn folder can draw again when a switch changes. */
let version = 0
export const getVersion = (): number => version

/** Calls `fn` after every change. Returns what stops it. */
export function onChange(fn: () => void): () => void {
	return store.subscribe(fn)
}

/** Starts counting changes. Called when the plugin starts, before any folder subscribes, so the count is up to date for them. */
export function watchChanges(): () => void {
	return store.subscribe(() => {
		version++
	})
}

/** Starts again from nothing. Used when the plugin stops. */
export function resetVersion(): void {
	version = 0
}

/** Whether a setting is on. */
export const isOn = (key: keyof FolderSettings): boolean =>
	store.get(key) === true
