import { buildActivity, dispatchActivity } from './activity'
import { APPLY_DELAY_MS, MIN_REFRESH_SECONDS, TAG } from './constants'
import { currentProfile } from './profiles'
import { read, state } from './state'
import { num, parseTime } from './variables'

/**
 * Keeps a looping custom timer going. When both a start and an end time are set, the timer counts down the same length
 * again and again: once a second it checks whether the countdown ran out and, if so, starts it again and sends the
 * presence. Any other timer stops the loop.
 */
export function ensureLoop(): void {
	clearInterval(state.loopTimer)
	state.loopTimer = undefined
	const p = currentProfile(read())
	const start = parseTime(p.customStart)
	const end = parseTime(p.customEnd)
	if (
		!read().enabled ||
		p.timestampMode !== 'custom' ||
		start === undefined ||
		end === undefined ||
		end <= start
	)
		return
	const duration = end - start
	state.loopTimer = setInterval(() => {
		if (Date.now() >= state.loopAnchor + duration) {
			state.loopAnchor = Date.now()
			apply(false)
		}
	}, 1000)
}

/**
 * Sends the presence of the chosen profile to Discord (or removes it when the plugin is switched off in the settings).
 *
 * If a newer application started while this one was waiting for images, this one is dropped. A failure is logged and
 * leaves the presence as it was.
 *
 * @param resetTimer True to restart the timers from now.
 */
export async function apply(resetTimer: boolean): Promise<void> {
	if (!state.active) return
	if (resetTimer) {
		state.appliedAt = Date.now()
		state.loopAnchor = state.appliedAt
	}
	ensureLoop()
	const seq = ++state.applySeq
	const settings = read()
	try {
		if (!settings.enabled) {
			dispatchActivity(null)
			return
		}
		const activity = await buildActivity(currentProfile(settings))
		if (seq !== state.applySeq || !state.active) return
		dispatchActivity(activity)
	} catch (error) {
		console.warn(`${TAG} apply failed:`, String(error))
	}
}

/** Applies soon, so a burst of changes (typing, switching) sends the presence once. */
export function scheduleApply(resetTimer: boolean): void {
	clearTimeout(state.applyTimer)
	state.applyTimer = setTimeout(() => apply(resetTimer), APPLY_DELAY_MS)
}

/** Starts, changes or stops the timer that sends the presence again every so many seconds (at least 15). */
export function restartRefresh(): void {
	clearInterval(state.refreshTimer)
	state.refreshTimer = undefined
	const seconds = num(read().refreshSeconds) || 0
	if (seconds > 0)
		state.refreshTimer = setInterval(
			() => apply(false),
			Math.max(MIN_REFRESH_SECONDS, seconds) * 1000,
		)
}
