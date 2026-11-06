import { Dispatcher } from '@valenced/discord/common/flux'
import { PID, SOCKET_ID } from '../constants'
import { diag } from '../diag'
import { getAssetManager, getHTTPUtils } from './modules'
import { getSettings, pluginState, setSettings } from './state'
import type { Activity, ActivityAssets, CustomRpcStorage } from '../types'

export function clearActivity() {
	return sendRequest(null)
}

export function sendRequest(activity: Activity | null) {
	// `clearActivity` routes back through here, so recursing after the plugin has
	// stopped would blow the stack. The stop-time clear is dispatched by the
	// cleanup handler *before* the flag is raised, so simply refusing here does
	// not strand the activity on the profile.
	if (pluginState.pluginStopped) return

	Dispatcher.dispatch({
		type: 'LOCAL_ACTIVITY_UPDATE',
		activity: activity,
		pid: PID,
		socketId: SOCKET_ID,
	})
}

async function resolveExternalAssets(
	urls: string[],
	appId: string,
): Promise<string[]> {
	const httpUtils = getHTTPUtils()
	if (!httpUtils) return []

	try {
		const resp = await httpUtils.post({
			// Must stay relative: `superagentPatch` only prepends the API base URL
			// and attaches `Authorization` for paths starting with "/". An absolute
			// URL goes out unauthenticated and Discord answers 404/401, which
			// silently dropped every URL-sourced image.
			url: `/applications/${appId}/external-assets`,
			body: { urls },
			oldFormErrors: true,
			rejectWithError: false,
		})
		if (resp?.ok === false) return []
		const body = resp?.body

		if (!Array.isArray(body)) return []

		return body.map(
			(item: { url: string; external_asset_path: string }) =>
				`mp:${item.external_asset_path}`,
		)
	} catch {
		return []
	}
}

/** Resolves an external image URL to a Discord asset path, if possible. */
export async function fetchAsset(
	asset: string[],
	appId: string,
): Promise<string[]> {
	if (!asset?.length) return []

	const remoteUrls: string[] = []
	for (const url of asset) {
		if (url && !url.startsWith('data:')) remoteUrls.push(url)
	}
	if (remoteUrls.length === 0) return []

	try {
		const assetManager = getAssetManager()
		const result = assetManager
			? await assetManager.fetchAssetIds(appId, remoteUrls)
			: undefined

		if (Array.isArray(result) && result.length > 0 && result[0]) {
			return result
		}

		const httpUrls = remoteUrls.filter(
			url => url.startsWith('http:') || url.startsWith('https:'),
		)
		if (httpUrls.length === 0) return []

		return await resolveExternalAssets(httpUrls, appId)
	} catch {
		return []
	}
}

function buildAssets(s: CustomRpcStorage): Promise<ActivityAssets> {
	const assets: ActivityAssets = {}

	const applyImage = async (
		image: CustomRpcStorage['largeImage'],
		imageKey: 'large' | 'small',
	) => {
		if (!image.value) return

		let imageValue: string | undefined

		if (image.source === 'key') {
			// Discord resolves the asset through
			// `ApplicationAssetUtils.getAssetImage`, which interpolates this value
			// straight into `app-assets/{application_id}/{value}.png`. The CDN
			// serves application assets by numeric **id** — the `name` 404s, which
			// is why the activity rendered with no image at all.
			imageValue = image.assetId || image.value
		} else if (image.source === 'url' && s.clientId) {
			const resolved = await fetchAsset([image.value], s.clientId)
			imageValue = resolved[0]
		}

		if (imageValue) {
			assets[`${imageKey}_image`] = imageValue
			if (image.text) {
				assets[`${imageKey}_text`] = image.text
			}
		}
	}

	return Promise.all([
		applyImage(s.largeImage, 'large'),
		applyImage(s.smallImage, 'small'),
	]).then(() => assets)
}

/** Guards the one-time seed of `timestampStart` against re-entrant publishes. */
let seededTimestamp = false

export async function buildActivity(
	s: CustomRpcStorage = getSettings(),
): Promise<Activity | null> {
	if (!s.enabled || !s.applicationName) return null

	const activity: Activity = {
		name: s.applicationName,
		flags: 0,
		type: s.activityType,
	}

	if (s.clientId) {
		activity.application_id = s.clientId
	}

	if (s.details) activity.details = s.details
	if (s.state) activity.state = s.state

	// The client's `getActivitySessionKey` uses `timestamps.start` as the session
	// id, so a fresh `Date.now()` on every publish changed the key, remounted the
	// card and restarted the counter on each edit. The anchor is persisted and only
	// seeded once — seeding on every publish would feed back into the storage
	// subscription that triggered it.
	//
	// Nothing here is gated on the activity type: `timestamps` is one field on the
	// activity, so Listening carries it exactly like Playing.
	if (s.showTimestamp) {
		if (!s.timestampStart && !seededTimestamp) {
			seededTimestamp = true
			setSettings({ timestampStart: Date.now() })
		}
		const start = s.timestampStart || Date.now()
		activity.timestamps = { start }
		// Only send an end that actually follows its start. An end at or before
		// the start renders as an absurd or negative span on the card, so a stale
		// pair is dropped rather than published.
		if (s.timestampEnd > start) activity.timestamps.end = s.timestampEnd
	}

	const assets = await buildAssets(s)
	if (Object.keys(assets).length > 0) {
		activity.assets = assets
	}

	// The client pairs `buttons[i]` (display text) with `metadata.button_urls[i]`,
	// so labels and URLs have to travel as two parallel arrays. Shipping objects
	// here left the card with text it could not render.
	const buttons = s.buttons
		.filter(b => b.enabled && b.label && b.url)
		.map(b => ({ label: b.label, url: b.url }))
	if (buttons.length > 0) {
		activity.buttons = buttons.map(b => b.label)
		activity.metadata = { button_urls: buttons.map(b => b.url) }
	}

	return activity
}

export async function applyActivity() {
	if (pluginState.pluginStopped) return

	let activity: Activity | null
	try {
		activity = await buildActivity()
	} catch (error) {
		diag.fail('activity', error)
		throw error
	}
	console.log('[CustomRPC] activity payload', JSON.stringify(activity))
	if (activity) {
		diag.log(
			'activity',
			`sent: type ${activity.type}, fields ${Object.keys(activity).join(', ')}`,
		)
		sendRequest(activity)
	} else {
		diag.log('activity', 'cleared (disabled or no application name)')
		clearActivity()
	}
}
