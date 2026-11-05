import { ToastActionCreators } from '@valenced/discord/actions'
import {
	DEFAULT_SETTINGS,
	MISS_RECHECK_MS,
	RATE_MAX,
	RATE_WINDOW_MS,
	REQUEST_TIMEOUT_MS,
	TOAST_KEY,
} from './constants'
import type { PendingSend, SoundCloudSettings, Status, Track } from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
let storage:
	| {
			cache?: Partial<SoundCloudSettings>
			set?: (value: SoundCloudSettings, replace: boolean) => unknown
	  }
	| undefined

/** Remembers the storage to read settings from and save to. */
export function setStorage(next: unknown): void {
	storage = next as typeof storage
}

/** The saved settings with every missing piece filled in from the defaults, so older saves keep working. */
export function merge(
	value: Partial<SoundCloudSettings> | undefined,
): SoundCloudSettings {
	const out = Object.assign(
		{},
		DEFAULT_SETTINGS,
		value || {},
	) as SoundCloudSettings
	if (!Array.isArray(out.recents)) out.recents = []
	return out
}

/** The settings as saved, filled in with defaults. */
export function read(): SoundCloudSettings {
	return merge(storage?.cache)
}

/** Saves some settings over the ones already saved. */
export function save(patch: Partial<SoundCloudSettings>): Promise<unknown> {
	return Promise.resolve(storage?.set?.(Object.assign({}, read(), patch), true))
}

/** Things that change as the plugin runs, kept together so every file reads the same ones. */
export const state: {
	/** Whether the plugin is running. */
	active: boolean
	/** Counts applications, so an older one that finishes late is dropped. */
	applySeq: number
	/** The track that Last.fm says is playing, if any. */
	auto: Track | null
	/** The last SoundCloud link found in the clipboard, so it is not shown twice. */
	lastClip: string
	/** Whether the person was already told Rich Presence is missing. */
	richWarned: boolean
	/** Whether Last.fm reported nothing once and a second look is pending. */
	missPending: boolean
	/** A check of Last.fm is running. */
	polling: boolean
	/** When Last.fm was last checked (milliseconds), for the preview. */
	lastPollAt: number
	/** The JSON of the last update sent, to drop repeats. */
	lastSentJson: string
	/** When the recent updates were sent, to stay inside Discord's allowance. */
	sentTimes: number[]
	/** An update waiting for its turn. */
	pendingSend: PendingSend | undefined
	endTimer: ReturnType<typeof setTimeout> | undefined
	endPollTimer: ReturnType<typeof setTimeout> | undefined
	pollTimer: ReturnType<typeof setInterval> | undefined
	missTimer: ReturnType<typeof setTimeout> | undefined
	sendTimer: ReturnType<typeof setTimeout> | undefined
	/** What the preview says about the last thing that happened. */
	status: Status
} = {
	active: false,
	applySeq: 0,
	auto: null,
	lastClip: '',
	richWarned: false,
	missPending: false,
	polling: false,
	lastPollAt: 0,
	lastSentJson: '',
	sentTimes: [],
	pendingSend: undefined,
	endTimer: undefined,
	endPollTimer: undefined,
	pollTimer: undefined,
	missTimer: undefined,
	sendTimer: undefined,
	status: { state: 'idle', text: '' },
}

/** The timings, as variables so they are kept in one place. */
export const tuning = {
	rateMax: RATE_MAX,
	rateWindow: RATE_WINDOW_MS,
	recheckMs: MISS_RECHECK_MS,
	requestTimeout: REQUEST_TIMEOUT_MS,
}

/** Functions to call when the status or the checks change, so the preview can redraw. */
let statusListeners: Array<() => void> = []

/** Registers a preview to be told about changes. Returns the function that unregisters it. */
export function listenToStatus(listener: () => void): () => void {
	statusListeners.push(listener)
	return () => {
		statusListeners = statusListeners.filter(l => l !== listener)
	}
}

/** Tells every preview to redraw. */
export function notifyListeners(): void {
	for (const listener of statusListeners) listener()
}

/** Sets what the preview says and tells it to redraw. */
export function setStatus(next: Status): void {
	state.status = next
	notifyListeners()
}

/** Asset ids already found, by image link, so the same image is not hosted twice. */
export const assetCache = new Map<string, string>()

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text })
	} catch {
		// Toasts are a convenience.
	}
}
