import { ToastActionCreators } from '@valenced/discord/actions'
import { TOAST_KEY } from './constants'
import { merge } from './profiles'
import type { RichPresenceSettings } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
let storage: { cache?: Partial<RichPresenceSettings> } | undefined

/** Remembers the storage to read settings from. */
export function setStorage(next: unknown): void {
	storage = next as typeof storage
}

/** The settings as saved, filled in with defaults. */
export function read(): RichPresenceSettings {
	return merge(storage?.cache)
}

/** Things that change as the plugin runs, kept together so every file reads the same ones. */
export const state: {
	/** Whether the plugin is running. */
	active: boolean
	/** When the presence was last applied from scratch (milliseconds); timers count from here. */
	appliedAt: number
	/** Counts applications, so an older one that finishes late is dropped. */
	applySeq: number
	/** When the looping custom timer last restarted (milliseconds). */
	loopAnchor: number
	refreshTimer: ReturnType<typeof setInterval> | undefined
	applyTimer: ReturnType<typeof setTimeout> | undefined
	loopTimer: ReturnType<typeof setInterval> | undefined
} = {
	active: false,
	appliedAt: Date.now(),
	applySeq: 0,
	loopAnchor: Date.now(),
	refreshTimer: undefined,
	applyTimer: undefined,
	loopTimer: undefined,
}

/** How each image slot (`large`, `small`) turned out: `ok`, an error text, or nothing. Shown in the preview. */
export const imageStatus: Record<string, string | undefined> = {}

/** Functions to call when `imageStatus` changes, so the preview can redraw. */
let statusListeners: Array<() => void> = []

/** Registers a preview to be told when an image status changes. Returns the function that unregisters it. */
export function listenToStatus(listener: () => void): () => void {
	statusListeners.push(listener)
	return () => {
		statusListeners = statusListeners.filter(l => l !== listener)
	}
}

/** Notes how an image turned out and tells the previews. */
export function setImageStatus(slot: string, status: string | undefined): void {
	if (imageStatus[slot] === status) return
	imageStatus[slot] = status
	for (const listener of statusListeners) listener()
}

/** Asset ids already found, by `app|key` or `link|url`, so the same image is not looked up twice. */
export const assetCache = new Map<string, string>()

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text })
	} catch {
		// Toasts are a convenience.
	}
}
