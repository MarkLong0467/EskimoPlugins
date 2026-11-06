import { Dispatcher } from '@valenced/discord/common/flux'
import { MAX_BUTTON_LABEL } from './constants'
import { resolveImage } from './images'
import { effectiveAppId } from './profiles'
import {
	appStart,
	dailyWindow,
	MINUTE,
	nextMidnight,
	nextOccurrence,
	parseClock,
	parseDate,
	startOfDay,
} from './timers'
import { text as fillText, num } from './variables'
import type { Activity, Profile, Runtime } from './types'

/** Whether a text is a web link. */
const isLink = (value: string | undefined): value is string =>
	!!value && /^https?:\/\//i.test(value)

/** The start and end the SoundCloud presence shares for "From the SoundCloud track", if it is showing a track. */
const sharedTimestamps = (): { start?: number; end?: number } | undefined =>
	(
		globalThis as unknown as {
			eskimoTimestamps?: { start?: number; end?: number }
		}
	).eskimoTimestamps

/**
 * How long a looping timer lasts, or nothing if the profile has none.
 *
 * - `custom` with both a start and an end set loops: it counts down the same length again and again.
 * - `countdown` loops when it is asked to: it starts over each time it runs out.
 */
export function loopLength(p: Profile): number | undefined {
	if (p.timestampMode === 'custom') {
		const start = parseDate(p.customStart)
		const end = parseDate(p.customEnd)
		return start !== undefined && end !== undefined && end > start
			? end - start
			: undefined
	}
	if (p.timestampMode === 'countdown' && p.countdownLoop) {
		const minutes = num(p.countdownMinutes) || 0
		return minutes > 0 ? minutes * MINUTE : undefined
	}
	return undefined
}

/**
 * The timer of the presence for a profile, or nothing if there is none (or it has nothing to show right now).
 *
 * - `elapsed` counts up from when the presence was applied, `app` from when Discord was opened, `clock` from midnight.
 * - `since` counts up from a date that has come; `until` counts down to a date, going on to the next one if it repeats.
 * - `countdown` ends a number of minutes after it was applied, or after its last restart when it loops.
 * - `midnight` ends at the next midnight.
 * - `daily` is a progress bar between two times of day, shown while the range is on.
 * - `custom` uses the start and end typed in. With both set the timer loops from a moving anchor.
 * - `external` uses the start and end of the SoundCloud track.
 */
export function timestampsFor(
	p: Profile,
	rt: Runtime,
	now = Date.now(),
): Activity['timestamps'] {
	switch (p.timestampMode) {
		case 'elapsed':
			return { start: rt.appliedAt }
		case 'app':
			return { start: appStart() }
		case 'clock':
			return { start: startOfDay(now) }
		case 'since': {
			const date = parseDate(p.timerDate)
			return date !== undefined && date <= now ? { start: date } : undefined
		}
		case 'until': {
			const date = parseDate(p.timerDate)
			if (date === undefined) return undefined
			const next = nextOccurrence(date, p.timerRepeat, now)
			return next === undefined ? undefined : { end: next }
		}
		case 'countdown': {
			const length = (num(p.countdownMinutes) || 0) * MINUTE
			if (!length) return undefined
			const end = (p.countdownLoop ? rt.loopAnchor : rt.appliedAt) + length
			return end > now ? { end } : undefined
		}
		case 'midnight':
			return { end: nextMidnight(now) }
		case 'daily': {
			const from = parseClock(p.dailyFrom)
			const to = parseClock(p.dailyTo)
			if (from === undefined || to === undefined) return undefined
			const window = dailyWindow(from, to, now)
			return window.inside
				? { start: window.start, end: window.end }
				: undefined
		}
		case 'external': {
			const shared = sharedTimestamps()
			if (!shared?.start) return undefined
			return shared.end
				? { start: shared.start, end: shared.end }
				: { start: shared.start }
		}
		case 'custom': {
			const start = parseDate(p.customStart)
			const end = parseDate(p.customEnd)
			if (start !== undefined && end !== undefined && end > start)
				return { start: rt.loopAnchor, end: rt.loopAnchor + (end - start) }
			if (start !== undefined || end !== undefined) {
				const timestamps: { start?: number; end?: number } = {}
				if (start !== undefined) timestamps.start = start
				if (end !== undefined) timestamps.end = end
				return timestamps
			}
			return undefined
		}
		default:
			return undefined
	}
}

/**
 * When the timer of a profile changes by itself, so the presence has to be sent again: a loop runs out, a countdown ends, a
 * date comes, midnight passes, or a daily range starts or ends. Nothing if it never does.
 */
export function nextChange(
	p: Profile,
	rt: Runtime,
	now = Date.now(),
): number | undefined {
	const length = loopLength(p)
	if (length !== undefined) return rt.loopAnchor + length
	switch (p.timestampMode) {
		case 'countdown': {
			const end = rt.appliedAt + (num(p.countdownMinutes) || 0) * MINUTE
			return end > now ? end : undefined
		}
		case 'since': {
			const date = parseDate(p.timerDate)
			return date !== undefined && date > now ? date : undefined
		}
		case 'until': {
			const date = parseDate(p.timerDate)
			return date === undefined
				? undefined
				: nextOccurrence(date, p.timerRepeat, now)
		}
		case 'midnight':
		case 'clock':
			return nextMidnight(now)
		case 'daily': {
			const from = parseClock(p.dailyFrom)
			const to = parseClock(p.dailyTo)
			if (from === undefined || to === undefined) return undefined
			const window = dailyWindow(from, to, now)
			return window.inside ? window.end : window.start
		}
		default:
			return undefined
	}
}

/**
 * Builds the activity Discord expects from a profile.
 *
 * @param p The profile.
 * @param rt What is kept for the profile: its timers.
 * @returns The activity, or nothing if the profile has no name, or "show only when" comes out empty (for example
 *   `{sc_title}` with nothing playing). Either way no presence is shown.
 */
export async function buildActivity(
	p: Profile,
	rt: Runtime,
): Promise<Activity | null> {
	/** A text with its variables filled in; `{uptime}` counts from when this profile was applied. */
	const text = (value: unknown) => fillText(value, rt.appliedAt)
	const name = text(p.name)
	if (!name) return null
	const gate = String(p.showOnlyWhen || '').trim()
	if (gate && !text(gate)) return null

	const appId = String(p.applicationId || '').trim() || '0'
	const activity: Activity = {
		application_id: effectiveAppId(p),
		name,
		type: Number(p.type) || 0,
		flags: 1,
	}
	const details = text(p.details)
	const stateText = text(p.state)
	if (details) activity.details = details
	if (stateText) activity.state = stateText
	const detailsUrl = text(p.detailsUrl)
	const stateUrl = text(p.stateUrl)
	if (isLink(detailsUrl)) activity.details_url = detailsUrl
	if (isLink(stateUrl)) activity.state_url = stateUrl
	if (activity.type === 1) {
		const url = text(p.streamUrl)
		if (url) activity.url = url
	}

	const timestamps = timestampsFor(p, rt)
	if (timestamps) activity.timestamps = timestamps

	const cur = num(p.partyCurrent)
	const max = num(p.partyMax)
	if (cur !== undefined && max !== undefined && max > 0)
		activity.party = { size: [Math.min(cur, max), max] }

	const assets: Record<string, string> = {}
	const large = await resolveImage(appId, p.largeImage, `${p.id}:large`)
	const small = await resolveImage(appId, p.smallImage, `${p.id}:small`)
	if (large) assets.large_image = large
	if (small) assets.small_image = small
	const largeText = text(p.largeText)
	const smallText = text(p.smallText)
	const largeUrl = text(p.largeUrl)
	const smallUrl = text(p.smallUrl)
	if (largeText && large) assets.large_text = largeText
	if (smallText && small) assets.small_text = smallText
	if (isLink(largeUrl) && large) assets.large_url = largeUrl
	if (isLink(smallUrl) && small) assets.small_url = smallUrl
	if (Object.keys(assets).length) activity.assets = assets

	const labels: string[] = []
	const urls: string[] = []
	for (const [labelField, urlField] of [
		[p.button1Label, p.button1Url],
		[p.button2Label, p.button2Url],
	]) {
		const label = text(labelField)
		const link = text(urlField)
		if (label && isLink(link)) {
			labels.push(label.slice(0, MAX_BUTTON_LABEL))
			urls.push(link)
		}
	}
	if (labels.length) {
		activity.buttons = labels
		activity.metadata = { button_urls: urls }
	}
	return activity
}

/**
 * Sends an activity to Discord as if a game had reported it, under the profile's own socket and process. `null` removes the
 * presence of that profile and leaves the others as they are.
 */
export function dispatchActivity(activity: Activity | null, rt: Runtime): void {
	Dispatcher.dispatch({
		type: 'LOCAL_ACTIVITY_UPDATE',
		activity,
		pid: rt.pid,
		socketId: rt.socket,
	} as never)
}
