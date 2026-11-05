import { ToastActionCreators } from '@valenced/discord/actions'
import { Vibration } from 'react-native'
import { redrawSettings, setting } from './config'
import { LOG_SIZE, TOAST_KEY } from './constants'
import type { LogEntry } from './types'

/** What the plugin found in Discord. Shown in the report and the self-check. */
export const found = { settings: 'not found', sheet: 0, editor: 0 }

/** The most recent actions, newest first. */
export const log: LogEntry[] = []

/** The preset applied last and when, so a screen can tell it is active. */
export const lastApplied = { id: '', at: 0 }

/** Marks which copy of the plugin is running, so a copy that was replaced leaves screens alone. */
export const INSTANCE = {}

/** The global the running copy's marker is kept in. */
export const INSTANCE_KEY = '__statusPresetsInstance'

/** Adds a line to the log of recent actions. */
export function addLog(text: string, ok: boolean): void {
	log.unshift({ at: Date.now(), text, ok })
	if (log.length > LOG_SIZE) log.length = LOG_SIZE
	redrawSettings()
}

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: unknown): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text: String(text) })
	} catch {
		// Toasts are a convenience.
	}
}

/** A short vibration, if the setting asks for it. */
export function buzz(): void {
	try {
		if (setting('buzz')) Vibration.vibrate(15)
	} catch {
		// No vibration on this phone.
	}
}
