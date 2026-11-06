import {
	MISS_RECHECK_MS,
	RATE_MAX,
	RATE_WINDOW_MS,
	REQUEST_TIMEOUT_MS,
} from './constants'
import type { Activity, Runtime, Status, Track } from './types'

/** An update of the SoundCloud presence waiting for its turn. */
export interface PendingSend {
	activity: Activity | null
	json: string
	rt: Runtime
}

/** What the SoundCloud part of the plugin keeps while it runs. The saved settings are in `settings.soundcloud`. */
export const sc: {
	/** The track that Last.fm says is playing, if any. */
	auto: Track | null
	/** The last SoundCloud link found in the clipboard, so it is not shown twice. */
	lastClip: string
	/** Whether Last.fm reported nothing once and a second look is pending. */
	missPending: boolean
	/** A check of Last.fm is running. */
	polling: boolean
	/** When Last.fm was last checked (milliseconds), for the preview. */
	lastPollAt: number
	/** Whether this plugin has put the track in the shared variables. */
	varsPushed: boolean
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
	auto: null,
	lastClip: '',
	missPending: false,
	polling: false,
	lastPollAt: 0,
	varsPushed: false,
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

/**
 * Functions the parts of the SoundCloud code call on each other without importing each other: Last.fm reports a new song
 * and asks for the presence to be refreshed. `soundcloud.ts` fills this in.
 */
export const hooks: { refresh: () => Promise<void> } = {
	refresh: async () => {},
}

/** Functions to call when the status or the checks change, so the preview can redraw. */
let statusListeners: Array<() => void> = []

/** Registers a preview to be told about changes. Returns the function that unregisters it. */
export function listenToSoundCloud(listener: () => void): () => void {
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
	sc.status = next
	notifyListeners()
}
