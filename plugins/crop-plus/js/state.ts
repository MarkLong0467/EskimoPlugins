import { redrawSettings } from './config'
import { LOG_SIZE } from './constants'
import type { Hooks, LogEntry, Stats } from './types'

/** Whether the cropper was found, which functions were wrapped, and what went wrong. */
export const hooks: Hooks = { cropper: 'not found', patched: [], problems: [] }

/** Counters shown in the settings and the report. */
export const stats: Stats = {
	crops: 0,
	passes: 0,
	extra: 0,
	shrunk: 0,
	cancelled: 0,
	skipped: 0,
}

/** The most recent actions, newest first. */
export const log: LogEntry[] = []

/** Things that change as the plugin runs, kept together so other files can read them. */
export const run: {
	/** The options of the last crop as the cropper got them, without colors and texts. */
	lastOptions: Record<string, unknown> | null
	/** What each pass of the last crop returned. */
	lastResults: string[]
	/** Whether the tip was already shown since Discord started. */
	tipShown: boolean
	/** Answers the "crop again" sheet that is open, if any. */
	answerWith: ((choice: 'done') => void) | null
} = { lastOptions: null, lastResults: [], tipShown: false, answerWith: null }

/** Adds a line to the log of recent actions. */
export function addLog(text: string, ok = true): void {
	log.unshift({ at: Date.now(), text, ok })
	if (log.length > LOG_SIZE) log.length = LOG_SIZE
	redrawSettings()
}

/** Writes down something that went wrong, once, in the report and the log. */
export function problem(what: string, error: unknown): void {
	const text = `${what}: ${(error as { message?: unknown } | undefined)?.message || error}`
	if (!hooks.problems.includes(text)) hooks.problems.push(text)
	addLog(text, false)
}
