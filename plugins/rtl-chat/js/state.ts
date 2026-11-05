import { DEFAULT_SETTINGS } from './constants'
import type { HookStatus, Mode, RtlSettings } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
let storage:
	| {
			cache?: Partial<RtlSettings>
			set?: (patch: Partial<RtlSettings>) => unknown
	  }
	| undefined

/** Remembers the storage to read settings from and save to. */
export function setStorage(next: unknown): void {
	storage = next as typeof storage
}

/** Saves some settings. */
export function saveSettings(patch: Partial<RtlSettings>): void {
	storage?.set?.(patch)
}

/**
 * Reads one setting: the saved value, or the default if nothing is saved.
 * The style `align`, which an earlier version used, is read as `rtl`.
 */
export function setting<K extends keyof RtlSettings>(key: K): RtlSettings[K] {
	const saved = storage?.cache
	const value =
		saved && saved[key] !== undefined ? saved[key] : DEFAULT_SETTINGS[key]
	return (key === 'mode' && value === 'align' ? 'rtl' : value) as RtlSettings[K]
}

/** Functions that redraw the mirrored app and the settings screen. */
let listeners: Array<() => void> = []

/** Registers something to redraw when a setting changes. Returns the function that unregisters it. */
export function listen(listener: () => void): () => void {
	listeners.push(listener)
	return () => {
		listeners = listeners.filter(l => l !== listener)
	}
}

/** Tells everything that draws itself from the settings to draw again. */
export function changed(): void {
	for (const listener of listeners.slice()) {
		try {
			listener()
		} catch {
			// A screen that is gone cannot be redrawn.
		}
	}
}

/** Forgets every listener. Used when the plugin stops. */
export function clearListeners(): void {
	listeners = []
}

/** Whether each hook is in place, and what it has seen. */
export const hooked: HookStatus = {
	how: 'not hooked yet',
	keys: [],
	fired: '',
	direction: '',
	image: false,
	input: false,
	rows: 'not hooked',
	seen: 0,
	changed: 0,
}

/** Whether the style is "mirror everything". */
export const mirrored = (): boolean => setting('mode') === 'mirror'

/** Whether message text is lined up on the right in the chosen style. */
export function textAligned(): boolean {
	const mode: Mode | 'align' = setting('mode')
	return mode === 'rtl' || mode === 'text'
}
