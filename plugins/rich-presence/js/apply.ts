import {
	buildActivity,
	dispatchActivity,
	loopLength,
	nextChange,
} from './activity'
import {
	APPLY_DELAY_MS,
	MIN_REFRESH_SECONDS,
	SEND_GAP_MS,
	TAG,
} from './constants'
import {
	buildSoundCloudActivity,
	dropPendingSend,
	effective,
	sendSoundCloud,
	soundCloudProblem,
} from './present'
import { maxActive, plan, soundCloudProfile } from './profiles'
import { allRuntimes, read, runtimeOf, state } from './state'
import { num } from './variables'
import type { Plan } from './profiles'
import type { Profile, RichPresenceSettings, Runtime, Standing } from './types'

/** How often the watcher looks at the clock (milliseconds). */
const WATCH_MS = 1000

/** The least time between two catch-ups of presences that are missing or should be gone (milliseconds). */
const CATCH_UP_GAP_MS = 5000

/** Waits a number of milliseconds. */
const pause = (ms: number) =>
	new Promise<void>(resolve => setTimeout(resolve, ms))

/** The plan for the settings now, with the SoundCloud profile asked whether it has a track. */
export const planNow = (
	settings: RichPresenceSettings = read(),
	now = Date.now(),
): Plan => plan(settings, s => soundCloudProblem(s, now), now)

/** Why a profile is shown or not, for the settings screen. See `plan` for the rules. */
export function standingOf(
	settings: RichPresenceSettings,
	p: Profile,
): Standing {
	return planNow(settings).why.get(p.id) ?? 'shown'
}

/** How many profiles are being shown right now, as far as the settings say. */
export function shownCount(settings: RichPresenceSettings): number {
	return planNow(settings).shown.length
}

/**
 * Watches the clock once a second for the things that change by themselves:
 * - a timer reaches its change (a loop starts over, a date comes, midnight passes, a range starts or ends): that profile is sent again,
 * - a profile's schedule starts or ends, a track finishes, or a profile that was over the limit gets room: the presences that
 *   are shown no longer match the ones that are sent, so everything is put right (at most every 5 seconds).
 */
export function ensureWatcher(): void {
	clearInterval(state.loopTimer)
	state.loopTimer = setInterval(() => {
		if (!state.active) return
		const now = Date.now()
		const settings = read()
		const { shown } = planNow(settings, now)
		const due: string[] = []
		for (const p of shown) {
			const rt = runtimeOf(p.id)
			if (rt.live && rt.changeAt && now >= rt.changeAt) {
				if (loopLength(p) !== undefined) rt.loopAnchor = now
				// Keeps a slow application from being asked again every second.
				rt.changeAt = 0
				due.push(p.id)
			}
		}
		if (due.length) applySome(due, false).catch(() => {})
		const live = new Set(
			allRuntimes()
				.filter(rt => rt.live)
				.map(rt => rt.id),
		)
		const mismatch =
			shown.some(p => !live.has(p.id)) ||
			[...live].some(id => !shown.some(p => p.id === id))
		if (mismatch && now - state.lastCatchUp >= CATCH_UP_GAP_MS) {
			state.lastCatchUp = now
			applyAll(false).catch(() => {})
		}
	}, WATCH_MS)
}

/** Takes one profile's presence away from Discord, leaving the others. */
export function clearProfile(rt: Runtime): void {
	rt.applySeq++
	rt.changeAt = 0
	if (soundCloudProfile(read())?.id === rt.id) dropPendingSend()
	if (!rt.live) return
	rt.live = false
	try {
		dispatchActivity(null, rt)
	} catch (error) {
		console.warn(`${TAG} clear failed:`, String(error))
	}
}

/** Takes every presence away from Discord. */
export function clearAll(): void {
	state.applyRun++
	for (const rt of allRuntimes()) clearProfile(rt)
}

/**
 * Builds and sends the presence of one profile. If a newer application of the same profile started while this one was
 * waiting for images, this one is dropped.
 */
async function sendOne(p: Profile, resetTimer: boolean): Promise<void> {
	const rt = runtimeOf(p.id)
	if (resetTimer) {
		rt.appliedAt = Date.now()
		rt.loopAnchor = rt.appliedAt
	}
	const seq = ++rt.applySeq
	const settings = read()
	let activity = null
	if (p.kind === 'soundcloud') {
		const track = effective(settings.soundcloud)
		activity = track
			? await buildSoundCloudActivity(p, settings.soundcloud, track)
			: null
	} else {
		activity = await buildActivity(p, rt)
	}
	if (seq !== rt.applySeq || !state.active) return
	if (p.kind === 'soundcloud') {
		sendSoundCloud(activity, rt)
		rt.changeAt = 0
	} else {
		dispatchActivity(activity, rt)
		rt.changeAt = activity ? (nextChange(p, rt) ?? 0) : 0
	}
	rt.live = activity !== null
}

/**
 * Sends the presence of every profile that is shown, one after another with a short gap, and takes away the presence of
 * every profile that is not shown any more (switched off, over the limit, outside its schedule, or the plugin is switched off).
 *
 * A failure of one profile is logged and does not stop the others.
 *
 * @param resetTimer True to restart the timers of every profile from now.
 */
export async function applyAll(resetTimer: boolean): Promise<void> {
	if (!state.active) return
	const run = ++state.applyRun
	const list = planNow().shown
	const keep = new Set(list.map(p => p.id))
	for (const rt of allRuntimes()) if (!keep.has(rt.id)) clearProfile(rt)
	let first = true
	for (const p of list) {
		if (!first) await pause(SEND_GAP_MS)
		first = false
		// A newer application of everything started while this one waited: it does the rest.
		if (run !== state.applyRun || !state.active) return
		try {
			await sendOne(p, resetTimer)
		} catch (error) {
			console.warn(`${TAG} apply failed:`, String(error))
		}
	}
}

/** Sends the presence of some profiles only (the ones that are shown), and leaves the others as they are. */
export async function applySome(
	ids: string[],
	resetTimer: boolean,
): Promise<void> {
	if (!state.active) return
	const list = planNow().shown.filter(p => ids.includes(p.id))
	// A profile that was asked for but is not shown any more is taken away.
	for (const id of ids)
		if (!list.some(p => p.id === id)) clearProfile(runtimeOf(id))
	let first = true
	for (const p of list) {
		if (!first) await pause(SEND_GAP_MS)
		first = false
		if (!state.active) return
		try {
			await sendOne(p, resetTimer)
		} catch (error) {
			console.warn(`${TAG} apply failed:`, String(error))
		}
	}
}

/**
 * Applies soon, so a burst of changes (typing, switching) sends once.
 *
 * @param resetTimer True to restart the timers.
 * @param ids The profiles that changed. Leave it out to apply every profile.
 */
export function scheduleApply(resetTimer: boolean, ids?: string[]): void {
	clearTimeout(state.applyTimer)
	if (ids) for (const id of ids) state.pending.add(id)
	else state.pendingAll = true
	if (resetTimer) state.pendingReset = true
	state.applyTimer = setTimeout(() => {
		const all = state.pendingAll
		const some = [...state.pending]
		const reset = state.pendingReset
		state.pendingAll = false
		state.pending.clear()
		state.pendingReset = false
		const run = all ? applyAll(reset) : applySome(some, reset)
		run.catch(error => console.warn(`${TAG} apply failed:`, String(error)))
	}, APPLY_DELAY_MS)
}

/** Starts, changes or stops the timer that sends the presences again every so many seconds (at least 15). */
export function restartRefresh(): void {
	clearInterval(state.refreshTimer)
	state.refreshTimer = undefined
	const seconds = num(read().refreshSeconds) || 0
	if (seconds > 0)
		state.refreshTimer = setInterval(
			() => applyAll(false),
			Math.max(MIN_REFRESH_SECONDS, seconds) * 1000,
		)
}

/** How many presences may be shown at once, for the settings screen. */
export const limitOf = (): number => maxActive(read())
