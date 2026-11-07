import { createStore } from '../../../shared/palmdevs/storage'
import { isStyle } from './time'
import type { Style, Zone } from './time'

/** What the popup does with the finished timestamp when the main button is pressed. */
export type Action = 'send' | 'insert' | 'copy'

/** A timestamp that was made before, so it can be picked again. */
export interface Recent {
	/** The moment (milliseconds). */
	at: number
	style: Style
	/** When it was made. */
	made: number
}

/** Everything the plugin saves. Only plain values and arrays: Valenced's storage merges objects. */
export interface Settings {
	/** Whether `/timestamp` is in the `/` menu. */
	command: boolean
	/** Whether `@time` in a message you send becomes a timestamp. */
	atTime: boolean
	/** The style `@time` uses when you do not name one. */
	atTimeStyle: Style
	/** What the main button does. */
	action: Action
	/** Skip the popup when `/timestamp` is given a time. */
	skipPopup: boolean
	/** Whether the popup starts with what you used last time. */
	remember: boolean
	/** What you used last time. */
	style: Style
	alsoRelative: boolean
	code: boolean
	message: string
	/** `'device'` or minutes east of UTC. */
	zone: Zone
	/** How many minutes the minute buttons move. */
	minuteStep: number
	/** 24-hour clocks on the screen. */
	h24: boolean
	/** Whether 3/4 is March 4th or the 3rd of April. */
	order: 'mdy' | 'dmy'
	/** A time with no day that has passed means tomorrow. */
	rollForward: boolean
	/** Show the quick picks in the popup. */
	quickPicks: boolean
	/** How many recent timestamps to keep. 0 keeps none. */
	recentsMax: number
	recents: Recent[]
}

/** What a new install starts with. */
export const DEFAULT_SETTINGS: Settings = {
	command: true,
	atTime: true,
	atTimeStyle: 'f',
	action: 'send',
	skipPopup: false,
	remember: true,
	style: 'f',
	alsoRelative: false,
	code: false,
	message: '',
	zone: 'device',
	minuteStep: 5,
	h24: false,
	order: 'mdy',
	rollForward: false,
	quickPicks: true,
	recentsMax: 5,
	recents: [],
}

/** The plugin's settings. */
export const store = createStore<Settings>(DEFAULT_SETTINGS)

/** How the minute buttons can step. */
export const MINUTE_STEPS = [1, 5, 10, 15, 30]

/** How many recents can be kept at most. */
export const RECENTS_LIMIT = 10

/** A setting, or its default when it is missing or damaged (a saved file from another version). */
export function setting<K extends keyof Settings>(key: K): Settings[K] {
	const value = store.get(key) as Settings[K] | undefined
	if (value === undefined || value === null) return DEFAULT_SETTINGS[key]
	switch (key) {
		case 'atTimeStyle':
		case 'style':
			return (isStyle(value) ? value : DEFAULT_SETTINGS[key]) as Settings[K]
		case 'zone':
			return (
				value === 'device' ||
				(typeof value === 'number' && Math.abs(value) <= 14 * 60)
					? value
					: 'device'
			) as Settings[K]
		case 'recents':
			return (Array.isArray(value) ? value.filter(isRecent) : []) as Settings[K]
		case 'minuteStep':
			return (MINUTE_STEPS.includes(value as number) ? value : 5) as Settings[K]
		default:
			return value
	}
}

function isRecent(value: unknown): value is Recent {
	const r = value as Partial<Recent> | null
	return (
		!!r &&
		typeof r.at === 'number' &&
		Number.isFinite(r.at) &&
		isStyle(r.style) &&
		typeof r.made === 'number'
	)
}

/** Changes settings. */
export function update(patch: Partial<Settings>): void {
	store.set(patch)
}

/** Puts a timestamp at the top of the recents, once, and keeps only as many as the person wants. */
export function addRecent(at: number, style: Style): void {
	const max = Math.min(setting('recentsMax'), RECENTS_LIMIT)
	if (max <= 0) {
		if (setting('recents').length) update({ recents: [] })
		return
	}
	const rest = setting('recents').filter(
		r => !(r.at === at && r.style === style),
	)
	update({ recents: [{ at, style, made: Date.now() }, ...rest].slice(0, max) })
}

/** Forgets the recents. */
export const clearRecents = (): void => update({ recents: [] })

/** Puts every setting back to how a new install starts. */
export function resetAll(): void {
	update({ ...DEFAULT_SETTINGS, recents: [] })
}
