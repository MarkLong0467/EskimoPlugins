import { cdnAppAssetByIdUrl } from '../constants'
import { isImagePickerAvailable, pickImage } from './imagePicker'
import { getHTTPUtils } from './modules'
import { showToast } from './toasts'
import type { PickedImage } from './imagePicker'

export type PortalOAuth2Asset = {
	id: string
	/** 1 = small image, 2 = large image. Absent when Discord omits it. */
	type?: 1 | 2
	name: string
}

export class PortalAPIError extends Error {
	status: number
	code?: number | string
	/** Untouched response/error, for the in-app details view. */
	raw: unknown
	constructor(
		status: number,
		message: string,
		code?: number | string,
		raw?: unknown,
	) {
		super(message)
		this.name = 'PortalAPIError'
		this.status = status
		this.code = code
		this.raw = raw
	}
}

function clip(value: string, max = 180) {
	return value.length > max ? `${value.slice(0, max)}…` : value
}

export function safeJson(value: unknown): string {
	if (typeof value === 'string') return value
	try {
		const json = JSON.stringify(value, null, 2)
		return json === undefined ? String(value) : json
	} catch {
		return String(value)
	}
}

/**
 * `HTTPUtils` rejects with superagent's own error object, whose shape is not
 * guaranteed to have a string `message`. Stringifying it blindly produces
 * "[object Object]", which hides the only information we need. Walk every
 * plausible field instead so a real message always survives.
 */
export function errorToText(err: unknown): string {
	if (err == null) return 'Request failed'
	if (typeof err === 'string') return clip(err)

	if (typeof err === 'object') {
		const value = err as any

		if (typeof value.message === 'string' && value.message) {
			const status = value.status ?? value.statusCode
			return clip(status ? `${status}: ${value.message}` : value.message)
		}
		if (value.message && typeof value.message === 'object') {
			return `message: ${clip(safeJson(value.message))}`
		}
		if (typeof value.text === 'string' && value.text) {
			return clip(value.text)
		}
		if (value.body !== undefined && value.body !== null) {
			if (typeof value.body === 'object') {
				const bodyMessage = (value.body as any).message
				if (typeof bodyMessage === 'string' && bodyMessage) {
					return clip(bodyMessage)
				}
			}
			return `body: ${clip(safeJson(value.body))}`
		}
		return clip(safeJson(value))
	}

	return String(err)
}

/** Full, untruncated payload for the in-app details row. */
export function errorDetails(err: unknown): string {
	const value = err as any
	if (value?.raw) {
		return safeJson(value.raw)
	}
	if (value && typeof value === 'object') {
		return safeJson({
			status: value.status,
			message: value.message,
			text: value.text,
			body: value.body,
		})
	}
	return safeJson(err)
}

/**
 * HTTPUtils resolves failures as `{ ok: false, status, body, text }`, but `body`
 * is only parsed JSON when Discord sends a JSON content type. Never return an
 * empty message: an opaque error is worse than a verbose one.
 */
function describeError(resp: any): { message: string; code?: number | string } {
	const status = resp?.status
	const body = resp?.body
	const prefix = status ? `HTTP ${status}` : 'Request failed'

	if (typeof body === 'string' && body) {
		return { message: `${prefix}: ${clip(body)}` }
	}

	if (body && typeof body === 'object') {
		if (typeof body.message === 'string' && body.message) {
			return { message: `${prefix}: ${clip(body.message)}`, code: body.code }
		}
		if (body.errors) {
			const first = (Object.values(body.errors)[0] as any) ?? {}
			const nested = first?._errors?.[0]?.message ?? first.message
			if (typeof nested === 'string' && nested) {
				return { message: `${prefix}: ${clip(nested)}` }
			}
		}
	}

	if (typeof resp?.text === 'string' && resp.text) {
		return { message: `${prefix}: ${clip(resp.text)}` }
	}

	return { message: prefix }
}

async function request<T>(
	method: 'get' | 'post' | 'del',
	path: string,
	body?: unknown,
): Promise<T> {
	const http = getHTTPUtils()
	if (!http) {
		throw new PortalAPIError(
			0,
			'Discord request utilities are not available yet',
		)
	}

	let resp: any
	try {
		// Must stay relative: superagentPatch only prepends the API base URL and
		// attaches `Authorization` when the path starts with "/". An absolute URL
		// silently goes out unauthenticated, which Discord answers with 404.
		resp = await http[method]({
			url: path,
			...(body !== undefined ? { body } : {}),
			oldFormErrors: true,
			rejectWithError: false,
		})
	} catch (thrown) {
		// Network/abort failures reject with superagent's own object shape.
		throw new PortalAPIError(
			(thrown as any)?.status ?? 0,
			errorToText(thrown),
			(thrown as any)?.code,
			thrown,
		)
	}

	if (!resp?.ok) {
		const { message, code } = describeError(resp)
		throw new PortalAPIError(resp?.status ?? 0, message, code, resp)
	}
	return resp.body as T
}

/**
 * Listing and creating applications are **not** part of the game client API.
 * They live on the Developer Portal's own host (`GLOBAL_ENV.DEVELOPERS_ENDPOINT`
 * — see `Constants.tsx`: `/developers/teams`, `/developers/applications/…`) and
 * need a separate portal session, which is why no such route exists on
 * `/api/v*` and `superagentPatch` will not authenticate them.
 *
 * What the game API *does* expose for an application you already own is
 * `/oauth2/applications/{id}/assets` (`Constants.APPLICATION_ASSETS`) and
 * `/applications/{id}/external-assets` (`APPLICATION_EXTERNAL_ASSETS`), both of
 * which the client itself uses in `utils/ApplicationAssetUtils.tsx`.
 *
 * So instead of a fake app list we verify a pasted Application ID against the
 * assets route, which both proves the ID works and primes the asset library.
 */
/**
 * Never trust the shape of this response. It is documented as a bare array of
 * assets, but a wrapped `{ assets: [...] }` (or an error envelope) would make a
 * naive `.map` throw during render, which React surfaces as a blank page with
 * no error at all. Normalising here keeps the UI total.
 */
function normalizeAssets(body: unknown): PortalOAuth2Asset[] {
	const candidates: unknown[] = Array.isArray(body)
		? body
		: Array.isArray((body as any)?.assets)
			? (body as any).assets
			: []

	return candidates
		.filter(
			(entry): entry is Record<string, any> =>
				!!entry && typeof entry === 'object',
		)
		.map((entry: Record<string, any>) => ({
			id: String(entry.id ?? ''),
			name: String(entry.name ?? ''),
			...(entry.type === 1 || entry.type === 2
				? { type: entry.type as 1 | 2 }
				: {}),
		}))
		.filter((asset: PortalOAuth2Asset) => asset.id !== '' && asset.name !== '')
}

export async function verifyApplication(
	appId: string,
): Promise<{ assets: PortalOAuth2Asset[] }> {
	const assets = await listOAuth2Assets(appId)
	return { assets }
}

export async function listOAuth2Assets(
	appId: string,
): Promise<PortalOAuth2Asset[]> {
	return normalizeAssets(
		await request<unknown>('get', `/oauth2/applications/${appId}/assets`),
	)
}

export type AssetAccess =
	| { ok: true; assetCount: number }
	| { ok: false; status: number; reason: string }

/**
 * Whether the signed-in account is allowed to manage this application's assets.
 *
 * `/oauth2/applications/{id}/assets` is owner-scoped, so the response *is* the
 * answer — there is no need to guess from a "my applications" list the game client
 * does not expose. 401/403 means this account is neither an owner nor a team
 * member, and no amount of retrying will let it upload.
 */
export async function checkAssetAccess(appId: string): Promise<AssetAccess> {
	if (!appId) return { ok: false, status: 0, reason: 'No application ID set' }
	try {
		const assets = await listOAuth2Assets(appId)
		return { ok: true, assetCount: assets.length }
	} catch (err) {
		const status = err instanceof PortalAPIError ? err.status : 0
		return {
			ok: false,
			status,
			reason:
				status === 401 || status === 403
					? 'This account does not own that application, so it cannot upload images for it'
					: errorToText(err),
		}
	}
}

/**
 * Logs the assets Discord actually has for this app together with the exact CDN
 * URL `ApplicationAssetUtils.getAssetImage` would build, plus its HTTP status.
 *
 * That URL is keyed by the numeric asset **id**, not the name — the name 404s.
 * An asset that 404s is silently dropped by the client, so a presence can show
 * its name and details and no image at all.
 */
export async function logAssetDiagnostics(appId: string): Promise<void> {
	try {
		const assets = await listOAuth2Assets(appId)
		for (const asset of assets) {
			const url = cdnAppAssetByIdUrl(appId, asset.id || asset.name)
			let status = 0
			try {
				const res = await fetch(url, { method: 'HEAD' })
				status = res.status
			} catch {
				status = -1
			}
			console.log(
				'[CustomRPC] asset',
				JSON.stringify({
					name: asset.name,
					id: asset.id,
					type: asset.type,
					url,
					status,
				}),
			)
		}
	} catch (err) {
		console.log('[CustomRPC] asset diagnostics failed', errorToText(err))
	}
}

/**
 * Whether the CDN can already serve this asset. A freshly created asset is not
 * immediately available: until it propagates the URL 404s, and the client caches
 * that miss, which is why an image can appear to "never" show up until the
 * activity is set again a moment later.
 */
export async function isAssetLive(
	appId: string,
	assetId: string,
): Promise<boolean> {
	if (!appId || !assetId) return false
	try {
		const res = await fetch(cdnAppAssetByIdUrl(appId, assetId), {
			method: 'HEAD',
		})
		return res.status === 200
	} catch {
		return false
	}
}

export async function createOAuth2Asset(
	appId: string,
	asset: { name: string; type: 1 | 2; image: string },
): Promise<PortalOAuth2Asset> {
	const body = await request<unknown>(
		'post',
		`/oauth2/applications/${appId}/assets`,
		asset,
	)
	// A create response may omit fields the list would carry, so fall back to what
	// we just asked for rather than returning an unusable object.
	return (
		normalizeAssets([body])[0] ?? {
			id: String((body as any)?.id ?? ''),
			name: (body as any)?.name ?? asset.name,
			type: asset.type,
		}
	)
}

export async function deleteOAuth2Asset(
	appId: string,
	assetId: string,
): Promise<void> {
	return request('del', `/oauth2/applications/${appId}/assets/${assetId}`)
}

function sanitizeKey(name: string): string {
	const key = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
	return key || 'image'
}

/**
 * Asset names are unique per application, so a nameless pick would collide with
 * the previous upload. `openImagePicker` does not always return a `fileName`, so
 * fall back to the file URI and finally to a short unique suffix.
 */
function uniqueKey(picked: PickedImage): string {
	const uri = typeof picked.uri === 'string' ? picked.uri : picked.uri?.uri
	const fromUri = uri?.split('/').pop()?.split('?')[0]
	const base = sanitizeKey(picked.fileName ?? fromUri ?? '')
	if (picked.fileName || fromUri) return base
	return `${base}_${Date.now().toString(36).slice(-5)}`
}

const MIME_PREFIX = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
} as const

function mimeOf(type: string, fileName?: string): string {
	if (type) return type
	const ext = (fileName?.split('.').pop() ?? '').toLowerCase()
	return (MIME_PREFIX as any)[ext] ?? 'image/png'
}

/**
 * `openImagePicker` hands back a single object whose `base64` is *already* a data
 * URI (`ConstantsIOS.Base64PNGPrefix` etc.), while the raw `ImagePicker` returns
 * `assets[0]` with a bare base64 payload. Normalise both into a data URI.
 */
function toDataUri(base64: string, mime: string): string {
	return base64.startsWith('data:') ? base64 : `data:${mime};base64,${base64}`
}

export async function pickAndUploadAsset(
	appId: string,
	type: 1 | 2,
): Promise<PortalOAuth2Asset | null> {
	// Same call Discord makes when you change your avatar or banner.
	const picked = await pickImage(512)
	if (!picked) {
		// Distinguish "unavailable" from "you cancelled", which look identical
		// from here but mean very different things.
		showToast(
			isImagePickerAvailable()
				? 'No image selected'
				: 'Image picker unavailable — see logs',
		)
		return null
	}

	const base64 = picked.base64 ?? picked.data
	if (!base64) {
		showToast('No image selected')
		return null
	}

	const key = uniqueKey(picked)
	const mime = mimeOf(picked.type ?? picked.mimeType ?? '', picked.fileName)

	showToast(`Creating "${key}" asset…`)
	try {
		return await createOAuth2Asset(appId, {
			name: key,
			type,
			image: toDataUri(base64, mime),
		})
	} catch (error) {
		const err = error as PortalAPIError
		showToast(`Could not create asset: ${err.message}`)
		return null
	}
}
