import { createStore } from '../../../shared/palmdevs/storage'

/** Everything the plugin saves. Only plain values and arrays: Valenced's storage merges objects. */
export interface Settings {
	/** The ids of the people whose pings are silenced. This is Equicord's `mutedUserIds`, as a list instead of one text. */
	users: string[]
	/** Silence the pings of everyone. */
	silenceAll: boolean
	/** Silence `@everyone` and `@here` from anyone. */
	silenceEveryone: boolean
	/** Silence role pings from anyone. */
	silenceRoles: boolean
	/** Whether `/silence` is in the `/` menu. */
	command: boolean
}

/** What a new install starts with: nobody is silenced. */
export const DEFAULT_SETTINGS: Settings = {
	users: [],
	silenceAll: false,
	silenceEveryone: false,
	silenceRoles: false,
	command: true,
}

/** The plugin's settings. */
export const store = createStore<Settings>(DEFAULT_SETTINGS)

/** A setting. */
export const setting = <K extends keyof Settings>(key: K): Settings[K] =>
	store.get(key)

/** The most people that can be silenced, so the list in the settings stays usable. */
export const MAX_USERS = 200
