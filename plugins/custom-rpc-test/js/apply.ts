import { buildActivity, dispatchActivity } from './activity'
import {
	APPLY_DELAY_MS,
	MIN_REFRESH_SECONDS,
	SEND_GAP_MS,
	TAG,
} from './constants'
import { maxActive, wanted } from './profiles'
import { allRuntimes, read, runtimeOf, state } from './state'
import { num, parseTime, text } from './variables'
import type { Profile, RichPresenceSettings, Runtime, Standing } from './types'

/** Waits a number of milliseconds. */
const pause = (ms: number) =>
	new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * How long a looping custom timer lasts, or nothing if the profile has none. A timer loops when both a start and an end
 * time are set: it counts down the same length again and again.
 */
export function loopLength(p: Profile): number | undefined {
	if (p.timestampMode !== 'custom') return undefined
	const start = parseTime(p.customStart)
	const end = parseTime(p.customEnd)
	return start !== undefined && end !== undefined && end > start
		? end - start
		: undefined
}

/**
 * Why a profile is shown or not, for the settings screen. A profile is shown when the main switch and its own are on, it is
 * within the limit, it has a name, and its "show only when" text is not empty.
 */
export function standingOf(
	settings: RichPresenceSettings,
	p: Profile,
): Standing {
	if (!settings.enabled || !p.enabled) return 'off'
	if (!wanted(settings).some(w => w.id === p.id)) return 'over the limit'
	if (!text(p.name)) return 'needs a name'
	const gate = String(p.showOnlyWhen || '').trim()
	if (gate && !text(gate)) return 'hidden by show only when'
	return 'shown'
}

/** The profiles that are being shown right now, as far as the settings say. */
export function shownCount(settings: RichPresenceSettings): number {
	return settings.profiles.filter(p => standingOf(settings, p) === 'shown')
		.length
}

/** Keeps the custom timers that loop going. One timer watches all of them: once a second it restarts any that ran out. */
export function ensureLoop(): void {
	clearInterval(state.loopTimer)
	state.loopTimer = undefined
	if (!wanted(read()).some(p => loopLength(p) !== undefined)) return
	state.loopTimer = setInterval(() => {
		for (const p of wanted(read())) {
			const length = loopLength(p)
			if (length === undefined) continue
			const rt = runtimeOf(p.id)
			if (Date.now() >= rt.loopAnchor + length) {
				rt.loopAnchor = Date.now()
				applySome([p.id], false).catch(() => {})
			}
		}
	}, 1000)
}

/** Takes one profile's presence away from Discord, leaving the others. */
export function clearProfile(rt: Runtime): void {
	rt.applySeq++
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
	const activity = await buildActivity(p, rt)
	if (seq !== rt.applySeq || !state.active) return
	dispatchActivity(activity, rt)
	rt.live = activity !== null
}

/**
 * Sends the presence of every profile that is shown, one after another with a short gap, and takes away the presence of
 * every profile that is not shown any more (switched off, over the limit, or the plugin is switched off).
 *
 * A failure of one profile is logged and does not stop the others.
 *
 * @param resetTimer True to restart the timers of every profile from now.
 */
export async function applyAll(resetTimer: boolean): Promise<void> {
	if (!state.active) return
	const run = ++state.applyRun
	const settings = read()
	const list = wanted(settings)
	const keep = new Set(list.map(p => p.id))
	for (const rt of allRuntimes()) if (!keep.has(rt.id)) clearProfile(rt)
	ensureLoop()
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
	const list = wanted(read()).filter(p => ids.includes(p.id))
	// A profile that was asked for but is not shown any more is taken away.
	for (const id of ids)
		if (!list.some(p => p.id === id)) clearProfile(runtimeOf(id))
	ensureLoop()
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
