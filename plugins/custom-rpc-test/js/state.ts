import { ToastActionCreators } from '@valenced/discord/actions'
import { PID_BASE, SOCKET_PREFIX, TOAST_KEY } from './constants'
import { merge } from './profiles'
import type { RichPresenceSettings, Runtime } from './types'

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
	refreshTimer: ReturnType<typeof setInterval> | undefined
	applyTimer: ReturnType<typeof setTimeout> | undefined
	/** The one timer that watches every looping custom timer. */
	loopTimer: ReturnType<typeof setInterval> | undefined
	/** The profile ids waiting to be applied (a change waits a moment so a burst of changes sends once). */
	pending: Set<string>
	/** Whether the waiting application restarts the timers. */
	pendingReset: boolean
	/** Whether every profile is waiting, not only the ones in `pending`. */
	pendingAll: boolean
	/** Counts applications of every profile, so an older one that is still waiting between profiles stops. */
	applyRun: number
} = {
	active: false,
	refreshTimer: undefined,
	applyTimer: undefined,
	loopTimer: undefined,
	pending: new Set(),
	pendingReset: false,
	pendingAll: false,
	applyRun: 0,
}

/** What is kept for each profile, by the profile's id. A profile gets its own the first time it is shown. */
const runtimes = new Map<string, Runtime>()

/** The next process number to give out. */
let nextPid = PID_BASE

/** The runtime of a profile, made on first use. */
export function runtimeOf(profileId: string): Runtime {
	let rt = runtimes.get(profileId)
	if (!rt) {
		rt = {
			id: profileId,
			socket: `${SOCKET_PREFIX}${profileId}`,
			pid: nextPid++,
			appliedAt: Date.now(),
			loopAnchor: Date.now(),
			applySeq: 0,
			live: false,
		}
		runtimes.set(profileId, rt)
	}
	return rt
}

/** Every runtime there is. */
export const allRuntimes = (): Runtime[] => [...runtimes.values()]

/** Forgets every runtime. Used when the plugin stops. */
export function forgetRuntimes(): void {
	runtimes.clear()
	nextPid = PID_BASE
}

/** How each image slot turned out, by `<profile id>:large` or `<profile id>:small`: `ok`, an error text, or nothing. Shown in the preview. */
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
