import { LOG_REPEAT_MS, MAX_HEARD, MAX_LOG_LINES } from './constants'
import type { HeardBuzz, HookStatus } from './types'

/**
 * What the plugin has noticed, shown on the settings screen. There is only one running copy of the plugin, so it is
 * kept at module level.
 */

/** The log: one line per event, newest last. Copied from the settings screen when a buzz is not caught. */
const log: string[] = []

/** Buzzes that went by, newest first. */
let heard: HeardBuzz[] = []

/** Whether each kind of hook is in place, in words. */
export const hooks: HookStatus = {
	menus: 'not found yet',
	libraries: 'none found',
	vibration: 'not found',
}

/** Redraw callbacks of the settings screens that are showing. */
let listeners: Array<() => void> = []

/** Registers a redraw callback. Returns a function that removes it. */
export function subscribe(listener: () => void): () => void {
	listeners.push(listener)
	return () => {
		listeners = listeners.filter(other => other !== listener)
	}
}

/** Forgets every redraw callback. Called when the plugin stops. */
export function clearListeners(): void {
	listeners = []
}

/** Asks every settings screen that is showing to draw itself again. A callback that throws does not stop the others. */
export function changed(): void {
	for (const listener of listeners.slice()) {
		try {
			listener()
		} catch {
			// One broken screen must not stop the rest.
		}
	}
}

/** Adds a line to the log, stamped with the time (`HH:MM:SS`). */
export function note(line: string): void {
	log.push(`${new Date().toTimeString().slice(0, 8)} ${line}`)
	if (log.length > MAX_LOG_LINES) log.shift()
	changed()
}

/** The log as text, or `empty`. */
export function logText(): string {
	return log.join('\n') || 'empty'
}

/** The buzzes that went by, newest first. */
export function heardList(): readonly HeardBuzz[] {
	return heard
}

/** Empties the list of buzzes and redraws. */
export function clearHeard(): void {
	heard = []
	changed()
}

/**
 * Remembers that a buzz went by and what was done about it.
 *
 * The same buzz with the same outcome is counted, not listed twice. The log gets a line the first time, then at most
 * one every `LOG_REPEAT_MS` for the same buzz, so a buzz that repeats fast does not flood it.
 */
export function saw(label: string, what: string): void {
	let item = heard.find(entry => entry.label === label && entry.note === what)
	if (!item) {
		item = { label, note: what, count: 0 }
		heard.unshift(item)
		if (heard.length > MAX_HEARD) heard.pop()
	}
	item.count++
	if (!item.at || Date.now() - item.at > LOG_REPEAT_MS) {
		note(`buzz: ${label} -> ${what} (${item.count}x so far)`)
	}
	item.at = Date.now()
	changed()
}
