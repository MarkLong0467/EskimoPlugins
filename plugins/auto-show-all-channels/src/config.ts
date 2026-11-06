import { createStore } from '../../../shared/palmdevs/storage'

/** What was done to a server. */
export type Outcome =
	| 'turned on'
	| 'already on'
	| 'not a community server'
	| 'not loaded'
	| 'failed'

/** One line of the list of servers that were dealt with. */
export interface HistoryEntry {
	/** The server's id. */
	id: string
	/** The server's name when it was dealt with. */
	name: string
	outcome: Outcome
	/** When, in milliseconds. */
	at: number
	/** Whether it was a server you just joined, or part of "all my servers". */
	how: 'joined' | 'all servers'
}

/** What the plugin saves. */
export interface AutoSettings {
	/** Turn on Show All Channels in each server you join. */
	enabled: boolean
	/** The servers that were dealt with once, so a server where you turn it off again is left alone. */
	handled: string[]
	/** The last servers that were dealt with, newest first. */
	history: HistoryEntry[]
}

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: AutoSettings = {
	enabled: true,
	handled: [],
	history: [],
}

/** How many ids of handled servers are kept. */
export const MAX_HANDLED = 600

/** How many lines of history are kept. */
export const MAX_HISTORY = 12

/** The plugin's settings. */
export const store = createStore<AutoSettings>(DEFAULT_SETTINGS)

/** Whether a server was dealt with already. */
export const isHandled = (guildId: string): boolean =>
	store.get('handled').includes(guildId)

/** Notes that a server was dealt with, and adds a line to the history. */
export function remember(entry: HistoryEntry): void {
	const handled = store.get('handled')
	const history = store.get('history')
	store.set({
		handled: handled.includes(entry.id)
			? handled
			: [...handled, entry.id].slice(-MAX_HANDLED),
		history: [entry, ...history.filter(h => h.id !== entry.id)].slice(
			0,
			MAX_HISTORY,
		),
	})
}

/** Forgets the servers that were dealt with and the history. */
export function forgetAll(): void {
	store.set({ handled: [], history: [] })
}
