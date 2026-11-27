import { createStore } from '../../../shared/palmdevs/storage'

/** When the reminder and the leave timer count. */
export type TimerWhen = 'deafened' | 'muted'

/** What the plugin saves. */
export interface SaverSettings {
	/** Tell Discord's voice engine to skip noise cancellation (Krisp) while you are muted. Discord's own unreleased option. */
	skipKrisp: boolean
	/** Also turn off echo cancellation, noise suppression, Krisp and gain control while muted, and back on when you unmute. */
	pauseProcessing: boolean
	/** Pause other people's cameras while you are deafened, and show them again when you undeafen. */
	pauseVideo: boolean
	/** Minutes before a reminder (a toast and a short vibration). 0 is off. */
	remindMinutes: number
	/** Minutes before the plugin leaves the call for you. 0 is off. */
	leaveMinutes: number
	/** Whether the timers count while deafened only, or while muted too. */
	timerWhen: TimerWhen
}

/** The settings used until the user changes something. Only the changes with no downside are on. */
export const DEFAULT_SETTINGS: SaverSettings = {
	skipKrisp: true,
	pauseProcessing: false,
	pauseVideo: true,
	remindMinutes: 0,
	leaveMinutes: 0,
	timerWhen: 'deafened',
}

/** The choices for the timers, in minutes (0 is off). */
export const MINUTE_CHOICES = [0, 15, 30, 45, 60, 90, 120, 180] as const

/** The plugin's settings. */
export const store = createStore<SaverSettings>(DEFAULT_SETTINGS)

/** A number of minutes from the settings, kept to a sane whole number (0 if damaged). */
export function minutes(key: 'remindMinutes' | 'leaveMinutes'): number {
	const value = Number(store.get(key))
	return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

/** The next choice after `current`, going round to Off after the last one. */
export function nextMinutes(current: number): number {
	const index = MINUTE_CHOICES.indexOf(
		current as (typeof MINUTE_CHOICES)[number],
	)
	return MINUTE_CHOICES[(index + 1) % MINUTE_CHOICES.length] ?? 0
}

/** "Off", "15 minutes", "1 hour", "1 hour 30 minutes". */
export function minutesText(value: number): string {
	if (!value) return 'Off'
	const h = Math.floor(value / 60)
	const m = value % 60
	const parts: string[] = []
	if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`)
	if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
	return parts.join(' ')
}
