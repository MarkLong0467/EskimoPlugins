import { createStore } from '../../../shared/palmdevs/storage'

/** An app the person hid in every server and DM. */
export interface HiddenEverywhere {
	/** The app's id (its Application ID). */
	id: string
	/** The app's name when it was hidden, so the settings can show it without Discord having it loaded. */
	name: string
	/** The app's icon hash when it was hidden, for the picture in the settings. */
	icon?: string
	/** When it was hidden (milliseconds). */
	at: number
}

/** An app the person hid in one server only. */
export interface HiddenInServer extends HiddenEverywhere {
	guildId: string
	/** The server's name when the app was hidden. */
	guildName: string
}

/** What the plugin saves. Arrays, so that removing an entry replaces the list (objects are merged by Valenced's storage). */
export interface HideSettings {
	everywhere: HiddenEverywhere[]
	servers: HiddenInServer[]
}

/** Nothing hidden until the person hides something. */
export const DEFAULT_SETTINGS: HideSettings = { everywhere: [], servers: [] }

/** The plugin's settings. */
export const store = createStore<HideSettings>(DEFAULT_SETTINGS)

/** Counts every change, so a screen (or a patched hook) can redraw when the lists change. */
let revision = 0
const listeners = new Set<() => void>()

/** The number of changes so far. Used as the snapshot of `useSyncExternalStore`. */
export const getRevision = (): number => revision

/** Calls `fn` after every change to the lists. Returns what stops it. */
export function onRevision(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}

/** Forgets everyone who listens and starts counting again. Used when the plugin stops. */
export function resetRevision(): void {
	listeners.clear()
	revision = 0
	cached = undefined
}

function changed(): void {
	revision++
	for (const fn of [...listeners]) {
		try {
			fn()
		} catch {
			// A screen that is gone must not stop the others.
		}
	}
}

/** The lists as sets, made once for each version of the saved lists so a draw does not search arrays. */
interface Lookup {
	everywhereList: HiddenEverywhere[]
	serversList: HiddenInServer[]
	everywhere: Set<string>
	servers: Map<string, Set<string>>
}

let cached: Lookup | undefined

function lookup(): Lookup {
	const everywhereList = store.get('everywhere')
	const serversList = store.get('servers')
	if (
		cached &&
		cached.everywhereList === everywhereList &&
		cached.serversList === serversList
	)
		return cached
	const servers = new Map<string, Set<string>>()
	for (const entry of serversList) {
		let set = servers.get(entry.guildId)
		if (!set) servers.set(entry.guildId, (set = new Set()))
		set.add(entry.id)
	}
	cached = {
		everywhereList,
		serversList,
		everywhere: new Set(everywhereList.map(entry => entry.id)),
		servers,
	}
	return cached
}

/** Whether an app is hidden in a place: hidden everywhere, or hidden in this server. `guildId` is empty in a DM. */
export function isHidden(appId: unknown, guildId?: unknown): boolean {
	if (typeof appId !== 'string' || !appId) return false
	const found = lookup()
	if (found.everywhere.has(appId)) return true
	return typeof guildId === 'string' && !!found.servers.get(guildId)?.has(appId)
}

/** Whether anything at all is hidden in a place, so the hooks can leave Discord's lists alone when nothing is. */
export function hasHidden(guildId?: unknown): boolean {
	const found = lookup()
	if (found.everywhere.size) return true
	return typeof guildId === 'string' && !!found.servers.get(guildId)?.size
}

/** The apps that are hidden in a place, for the report. Only ids and counts, never names. */
export function counts(): { everywhere: number; servers: number } {
	const found = lookup()
	return {
		everywhere: found.everywhereList.length,
		servers: found.serversList.length,
	}
}

/** An app as the menu knows it. */
export interface AppInfo {
	id: string
	name: string
	icon?: string
}

/** Hides an app in every server and DM. Its entries for single servers are no longer needed and are removed. */
export function hideEverywhere(app: AppInfo): void {
	const list = store.get('everywhere')
	if (list.some(entry => entry.id === app.id)) return
	store.set({
		everywhere: [
			...list,
			{ id: app.id, name: app.name, icon: app.icon, at: Date.now() },
		],
		servers: store.get('servers').filter(entry => entry.id !== app.id),
	})
	changed()
}

/** Hides an app in one server. */
export function hideInServer(
	app: AppInfo,
	guildId: string,
	guildName: string,
): void {
	const list = store.get('servers')
	if (list.some(entry => entry.id === app.id && entry.guildId === guildId))
		return
	store.set({
		servers: [
			...list,
			{
				id: app.id,
				name: app.name,
				icon: app.icon,
				at: Date.now(),
				guildId,
				guildName,
			},
		],
	})
	changed()
}

/** Shows an app that was hidden everywhere. */
export function showEverywhere(appId: string): void {
	store.set({
		everywhere: store.get('everywhere').filter(entry => entry.id !== appId),
	})
	changed()
}

/** Shows an app that was hidden in one server. */
export function showInServer(guildId: string, appId: string): void {
	store.set({
		servers: store
			.get('servers')
			.filter(entry => !(entry.guildId === guildId && entry.id === appId)),
	})
	changed()
}

/** Shows everything again. */
export function showAll(): void {
	store.set({ everywhere: [], servers: [] })
	changed()
}
