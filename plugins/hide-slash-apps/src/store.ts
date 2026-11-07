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

/** One command the person hid, of an app or one of Discord's built-in commands. */
export interface HiddenCommand {
	/** The command's id. Built-in commands have small negative ids such as `-1` (shrug). */
	id: string
	/** The command's name when it was hidden, without the slash. */
	name: string
	/** The id and name of the app it belongs to. Built-in commands belong to {@link BUILT_IN_APP_ID}. */
	appId: string
	appName: string
	/** The server it is hidden in. Nothing means it is hidden everywhere. */
	guildId?: string
	guildName?: string
	/** When it was hidden (milliseconds). */
	at: number
}

/** The id of the section that holds Discord's built-in commands. */
export const BUILT_IN_APP_ID = '-1'

/** What the plugin saves. Arrays, so that removing an entry replaces the list (objects are merged by Valenced's storage). */
export interface HideSettings {
	everywhere: HiddenEverywhere[]
	servers: HiddenInServer[]
	commands: HiddenCommand[]
}

/** Nothing hidden until the person hides something. */
export const DEFAULT_SETTINGS: HideSettings = {
	everywhere: [],
	servers: [],
	commands: [],
}

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
	commandsList: HiddenCommand[]
	everywhere: Set<string>
	servers: Map<string, Set<string>>
	commandsEverywhere: Set<string>
	commandsServers: Map<string, Set<string>>
}

let cached: Lookup | undefined

function lookup(): Lookup {
	const everywhereList = store.get('everywhere')
	const serversList = store.get('servers')
	const commandsList = store.get('commands')
	if (
		cached &&
		cached.everywhereList === everywhereList &&
		cached.serversList === serversList &&
		cached.commandsList === commandsList
	)
		return cached
	const servers = new Map<string, Set<string>>()
	for (const entry of serversList) {
		let set = servers.get(entry.guildId)
		if (!set) servers.set(entry.guildId, (set = new Set()))
		set.add(entry.id)
	}
	const commandsEverywhere = new Set<string>()
	const commandsServers = new Map<string, Set<string>>()
	for (const entry of commandsList) {
		if (!entry.guildId) {
			commandsEverywhere.add(entry.id)
			continue
		}
		let set = commandsServers.get(entry.guildId)
		if (!set) commandsServers.set(entry.guildId, (set = new Set()))
		set.add(entry.id)
	}
	cached = {
		everywhereList,
		serversList,
		commandsList,
		everywhere: new Set(everywhereList.map(entry => entry.id)),
		servers,
		commandsEverywhere,
		commandsServers,
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

/** Whether a single command is hidden in a place: hidden everywhere, or hidden in this server. */
export function isCommandHidden(
	commandId: unknown,
	guildId?: unknown,
): boolean {
	if (typeof commandId !== 'string' || !commandId) return false
	const found = lookup()
	if (found.commandsEverywhere.has(commandId)) return true
	return (
		typeof guildId === 'string' &&
		!!found.commandsServers.get(guildId)?.has(commandId)
	)
}

/** Whether anything at all is hidden in a place, so the hooks can leave Discord's lists alone when nothing is. */
export function hasHidden(guildId?: unknown): boolean {
	const found = lookup()
	if (found.everywhere.size || found.commandsEverywhere.size) return true
	if (typeof guildId !== 'string') return false
	return (
		!!found.servers.get(guildId)?.size ||
		!!found.commandsServers.get(guildId)?.size
	)
}

/** How much is hidden, for the report. Only counts, never names. */
export function counts(): {
	everywhere: number
	servers: number
	commandsEverywhere: number
	commandsInServers: number
} {
	const found = lookup()
	return {
		everywhere: found.everywhereList.length,
		servers: found.serversList.length,
		commandsEverywhere: found.commandsList.filter(entry => !entry.guildId)
			.length,
		commandsInServers: found.commandsList.filter(entry => !!entry.guildId)
			.length,
	}
}

/** An app as the menu knows it. */
export interface AppInfo {
	id: string
	name: string
	icon?: string
}

/** A command as the menu knows it. */
export interface CommandInfo {
	id: string
	name: string
	appId: string
	appName: string
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

/**
 * Hides one command, everywhere or in one server.
 *
 * @param command The command.
 * @param guild The server to hide it in. Nothing hides it everywhere, which also replaces its entries for single servers.
 */
export function hideCommand(
	command: CommandInfo,
	guild?: { id: string; name: string },
): void {
	const list = store.get('commands')
	const same = (entry: HiddenCommand) =>
		entry.id === command.id &&
		(guild ? entry.guildId === guild.id : !entry.guildId)
	if (list.some(same)) return
	const entry: HiddenCommand = {
		id: command.id,
		name: command.name,
		appId: command.appId,
		appName: command.appName,
		at: Date.now(),
		...(guild ? { guildId: guild.id, guildName: guild.name } : {}),
	}
	store.set({
		commands: [
			...(guild ? list : list.filter(item => item.id !== command.id)),
			entry,
		],
	})
	changed()
}

/** Shows a command again: the one hidden in that server, or the one hidden everywhere when no server is given. */
export function showCommand(commandId: string, guildId?: string): void {
	store.set({
		commands: store
			.get('commands')
			.filter(
				entry =>
					!(
						entry.id === commandId &&
						(guildId ? entry.guildId === guildId : !entry.guildId)
					),
			),
	})
	changed()
}

/** Shows everything again. */
export function showAll(): void {
	store.set({ everywhere: [], servers: [], commands: [] })
	changed()
}
