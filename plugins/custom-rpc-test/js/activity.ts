import { Dispatcher } from '@valenced/discord/common/flux'
import { MAX_BUTTON_LABEL } from './constants'
import { resolveImage } from './images'
import { text as fillText, num, parseTime } from './variables'
import type { Activity, Profile, Runtime } from './types'

/** Whether a text is a web link. */
const isLink = (value: string | undefined): value is string =>
	!!value && /^https?:\/\//i.test(value)

/**
 * The timer of the presence for a profile, or nothing if there is none.
 *
 * - `elapsed` counts up from when the presence was applied; `clock` from midnight, so it reads like the time of day.
 * - `countdown` ends a number of minutes after it was applied.
 * - `external` uses the start and end another plugin put in `globalThis.eskimoTimestamps`.
 * - `custom` uses the start and end typed in. With both set the timer loops: it restarts from a moving anchor each time it
 *   runs out.
 */
function timestampsFor(p: Profile, rt: Runtime): Activity['timestamps'] {
	if (p.timestampMode === 'elapsed') return { start: rt.appliedAt }
	if (p.timestampMode === 'clock') {
		const now = new Date()
		return {
			start:
				Date.now() -
				(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) *
					1000,
		}
	}
	if (p.timestampMode === 'countdown')
		return { end: rt.appliedAt + (num(p.countdownMinutes) || 0) * 60000 }
	if (p.timestampMode === 'external') {
		const shared = (
			globalThis as unknown as {
				eskimoTimestamps?: { start?: number; end?: number }
			}
		).eskimoTimestamps
		if (shared?.start)
			return shared.end
				? { start: shared.start, end: shared.end }
				: { start: shared.start }
		return undefined
	}
	if (p.timestampMode === 'custom') {
		const start = parseTime(p.customStart)
		const end = parseTime(p.customEnd)
		if (start !== undefined && end !== undefined && end > start)
			return { start: rt.loopAnchor, end: rt.loopAnchor + (end - start) }
		if (start !== undefined || end !== undefined) {
			const timestamps: { start?: number; end?: number } = {}
			if (start !== undefined) timestamps.start = start
			if (end !== undefined) timestamps.end = end
			return timestamps
		}
	}
	return undefined
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
		application_id: appId,
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
