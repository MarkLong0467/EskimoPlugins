/** Whether the hook in Discord's event stream is in place. */
export type HookState = 'waiting' | 'registered' | 'failed'

/** One person who pinged you since the plugin started, so they can be silenced from the settings with one tap. */
export interface Pinger {
	id: string
	/** The name and picture the message carried. Kept in memory only, never saved and never in the report. */
	name: string
	username: string
	avatar: string | null
	/** How many pings from them since the plugin started, and how many of those were silenced. */
	pings: number
	silenced: number
	/** When the last one came. */
	at: number
}

/** The most recent pingers kept. */
export const RECENT_MAX = 12

/** What the plugin has done since it started, for the settings screen and the report. */
export const state = {
	/** The hook that sees messages before Discord's stores do, and how far it got. */
	hook: 'waiting' as HookState,
	/** Messages seen (created and edited), and how many were from someone silenced. */
	created: 0,
	updated: 0,
	fromSilenced: 0,
	/** What was cleared from messages: direct pings (a message that mentioned you), `@everyone` and `@here`, role pings. */
	clearedDirect: 0,
	clearedEveryone: 0,
	clearedRoles: 0,
	/** Notification events seen and blocked. Discord's phone app may never send these; the report says so. */
	notifications: 0,
	notificationsBlocked: 0,
	/** Events that made the plugin throw, and the last one's text. */
	failures: 0,
	/** What a message looked like the last time, as yes or no for each part. Never any id or text. */
	shape: '',
	/** Whether your own id could be read, so direct pings could be told apart. */
	meKnown: false,
	/** The command. */
	commandModule: false,
	commandHook: 'waiting' as HookState,
	listCalls: 0,
	listWithOurs: 0,
	commandRuns: 0,
	/** People who pinged you, newest first. */
	recent: [] as Pinger[],
	/** Looked up names of people who are not in Discord's user store, by id. Not saved. */
	names: new Map<
		string,
		{ name: string; username: string; avatar: string | null }
	>(),
	last: '',
}

/** Starts counting again. Used when the plugin stops. */
export function resetState(): void {
	state.hook = 'waiting'
	state.created = 0
	state.updated = 0
	state.fromSilenced = 0
	state.clearedDirect = 0
	state.clearedEveryone = 0
	state.clearedRoles = 0
	state.notifications = 0
	state.notificationsBlocked = 0
	state.failures = 0
	state.shape = ''
	state.meKnown = false
	state.commandModule = false
	state.commandHook = 'waiting'
	state.listCalls = 0
	state.listWithOurs = 0
	state.commandRuns = 0
	state.recent = []
	state.names.clear()
	state.last = ''
}
