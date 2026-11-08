import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { IMAGE_APP_ID, IMAGE_TYPES, TAG } from './constants'
import { assetCache, setImageStatus } from './state'
import { fill } from './variables'
import type { AssetUtils, Http } from './types'

/** Links already looked at, so a page is only fetched once. */
const linkCache = new Map<string, string>()

/** Finds a module by the functions it has, described by the type the caller gives. */
const findByProps = <T>(...props: string[]): T | undefined =>
	lookupModule(
		(withProps as (...names: string[]) => ReturnType<typeof withProps>)(
			...props,
		),
	)[0] as unknown as T | undefined

/** A link found in a page, made absolute against the page's address. */
function absoluteUrl(found: string, base: string): string | undefined {
	try {
		return new URL(found.replace(/&amp;/g, '&'), base).href
	} catch {
		return undefined
	}
}

/**
 * Turns any link you could post in chat into a direct image link: image links stay as they are, Imgur page links become
 * the image, and other pages give the picture Discord would embed (`og:image` and its relatives, a `link rel=image_src`,
 * or for postimg.cc the direct link in the page). A page that cannot be read is left as the link it was.
 */
export async function findImageUrl(link: string): Promise<string> {
	const known = linkCache.get(link)
	if (known !== undefined) return known
	let result = link
	try {
		const imgur =
			/^https?:\/\/(?:www\.|m\.)?imgur\.com\/(?!a\/|gallery\/|t\/)(\w{5,8})\/?$/i.exec(
				link,
			)
		if (imgur) {
			result = `https://i.imgur.com/${imgur[1]}.png`
		} else if (!IMAGE_TYPES.test(link)) {
			const res = await fetch(link, {
				headers: {
					'User-Agent':
						'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
					Accept: 'text/html,image/*',
				},
			})
			const type = res.headers?.get?.('content-type') || ''
			if (res.ok && !/^image\//i.test(type)) {
				const html = (await res.text()).slice(0, 400000)
				const tags = html.match(/<meta[^>]+>|<link[^>]+>/gi) || []
				const wanted = [
					'og:image:secure_url',
					'og:image:url',
					'og:image',
					'twitter:image',
					'twitter:image:src',
				]
				let found: string | undefined
				for (let w = 0; w < wanted.length && !found; w++) {
					for (let t = 0; t < tags.length && !found; t++) {
						const tag = tags[t]
						const name = /(?:property|name)=["']([^"']+)["']/i.exec(tag)
						const content = /content=["']([^"']+)["']/i.exec(tag)
						if (name && content && name[1].toLowerCase() === wanted[w])
							found = content[1]
					}
				}
				if (!found) {
					const rel = tags.filter(x => /rel=["']image_src["']/i.test(x))[0]
					const href = rel && /href=["']([^"']+)["']/i.exec(rel)
					if (href) found = href[1]
				}
				if (!found) {
					// Pages like postimg.cc show the direct link in the page even without preview tags.
					const direct =
						/https:\/\/i\.postimg\.cc\/[^"'\s<>]+?\.(?:png|jpe?g|gif|webp)/i.exec(
							html,
						)
					if (direct) found = direct[0]
				}
				const abs = found && absoluteUrl(found, link)
				if (abs) result = abs
			}
		}
	} catch {
		// The link is used as it was.
	}
	linkCache.set(link, result)
	return result
}

/** Links that are signed or expire, where adding anything to the link could make it stop working. */
const SIGNED_LINK =
	/[?&](?:ex|is|hm|sig|signature|token|expires|x-amz-[a-z-]+|x-goog-[a-z-]+)=/i

/** Discord's own storage links are signed, and Discord already gives each upload its own link. */
const DISCORD_STORAGE = /^https?:\/\/(?:cdn|media)\.discordapp\.(?:com|net)\//i

/** How long the version of a link is kept before the picture is looked at again, so a refresh every few seconds costs nothing. */
const VERSION_TTL_MS = 10 * 60_000

/** The biggest picture that is looked at (bytes). A bigger one is used as it is. */
const VERSION_MAX_BYTES = 4 * 1024 * 1024

/** The name of the version added to a link. */
const VERSION_PARAM = 'ev'

/** Links already looked at, with the link to send and when it was made. */
const versionCache = new Map<string, { link: string; at: number }>()

/** A short fingerprint of some bytes (FNV-1a, 32 bits) as 8 hex digits. */
export function fingerprint(bytes: Uint8Array): string {
	let hash = 0x811c9dc5
	for (let i = 0; i < bytes.length; i++) {
		hash ^= bytes[i] as number
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Makes a link change when the picture behind it changes.
 *
 * Discord keeps a copy of every linked image, by the exact link, and shows that copy for as long as it likes: a picture that
 * changes behind the same link (a profile picture that is updated, a "now playing" image) does not change in the presence.
 * The picture is fetched once, a fingerprint of it is added to the link (`?ev=1a2b3c4d`), and Discord is given that link. A new
 * picture is a new link, so Discord fetches it again; the same picture is the same link, so nothing is fetched twice. Signed
 * links are left as they are, and so is any link that cannot be fetched.
 *
 * @param link A direct image link.
 * @returns The link to send.
 */
export async function versionedLink(link: string): Promise<string> {
	if (SIGNED_LINK.test(link) || DISCORD_STORAGE.test(link)) return link
	const known = versionCache.get(link)
	if (known && Date.now() - known.at < VERSION_TTL_MS) return known.link
	let result = link
	try {
		const res = await fetch(link, { headers: { Accept: 'image/*' } })
		if (res.ok) {
			const bytes = new Uint8Array(await res.arrayBuffer())
			if (bytes.length > 0 && bytes.length <= VERSION_MAX_BYTES) {
				const cut = link.indexOf('#')
				const base = cut >= 0 ? link.slice(0, cut) : link
				const tail = cut >= 0 ? link.slice(cut) : ''
				result = `${base}${base.includes('?') ? '&' : '?'}${VERSION_PARAM}=${fingerprint(bytes)}${tail}`
			}
		}
	} catch {
		// The link is sent as it is.
	}
	versionCache.set(link, { link: result, at: Date.now() })
	return result
}

/**
 * Asks Discord to host an image link for use in a presence, under the given application.
 *
 * Discord's own connection is used when it can be found, and otherwise a plain request with the account token.
 *
 * @param app The application the presence is sent for, or `0`.
 * @param url The image link.
 * @returns An `mp:` asset id.
 */
async function externalAssetFor(app: string, url: string): Promise<string> {
	const path = `/applications/${app}/external-assets`
	const body = { urls: [url] }
	let list: Array<{ external_asset_path?: string }> | undefined
	const http =
		findByProps<Http>('HTTPResponseError', 'get') ||
		findByProps<Http>('get', 'post', 'patch')
	if (http && typeof http.post === 'function') {
		try {
			const answer = await http.post({ url: path, body })
			list = answer?.body as typeof list
		} catch (error) {
			// A real answer from Discord (an error with a status or body) is passed on; anything else tries the plain request.
			const e = error as { status?: unknown; body?: unknown } | undefined
			if (e && (e.status != null || e.body != null)) throw error
		}
	}
	if (!list) {
		const auth = findByProps<{ getToken?: () => string | undefined }>(
			'getToken',
		)
		const token = auth?.getToken?.()
		if (!token) throw new Error('Could not find a way to reach Discord')
		const res = await fetch(`https://discord.com/api/v9${path}`, {
			method: 'POST',
			headers: { Authorization: token, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
		if (!res.ok) throw new Error(`Discord said no (${res.status})`)
		list = await res.json()
	}
	let link = list?.[0]?.external_asset_path
	if (!link) throw new Error('Discord returned no image for this link')
	if (/^https:\/\/media\.discordapp\.net/.test(link))
		link = link.split('/').slice(3).join('/')
	return `mp:${link}`
}

/**
 * Asks Discord to host an image link, under the application the presence is sent for when there is one (this is what
 * Discord's own asset code does), and under application `0` when that is not possible.
 *
 * @param url The image link.
 * @param appId The Application id of the profile, or nothing.
 * @returns An `mp:` asset id.
 */
async function externalAsset(url: string, appId?: string): Promise<string> {
	const own = appId && /^\d{5,}$/.test(appId.trim()) ? appId.trim() : undefined
	if (own) {
		try {
			return await externalAssetFor(own, url)
		} catch (error) {
			console.warn(
				`${TAG} could not host the image under application ${own}:`,
				errorText(error),
			)
		}
	}
	return externalAssetFor('0', url)
}

/** The text of an error from Discord's connection (its message, or the whole thing). */
const errorText = (error: unknown): string => {
	const e = error as
		| { body?: { message?: unknown }; message?: unknown }
		| undefined
	return String((e && ((e.body && e.body.message) || e.message)) || error)
}

/**
 * Turns an image link or asset key into a Discord asset id, and notes how it went for the preview.
 *
 * - An `mp:` id passes through unchanged.
 * - A link is first turned into a direct image link, then Discord's own asset code is tried, then Discord's web API.
 * - An asset key is tried with your Application id first, then the fallback one, then the application's public asset list.
 *
 * @param appId The Application id of the profile (`0` or empty for none).
 * @param value The image field as typed; variables are filled in.
 * @param slot `large` or `small`, for the status shown in the preview.
 * @returns The asset id, or nothing if the field is empty or the image could not be found (the preview says why).
 */
export async function resolveImage(
	appId: string,
	value: unknown,
	slot: string,
): Promise<string | undefined> {
	const filled = fill(value)
	if (typeof filled !== 'string' || !filled.trim()) {
		setImageStatus(slot, undefined)
		return undefined
	}
	let v: string = filled.trim()
	if (/^mp:/i.test(v)) return v
	const utils =
		findByProps<AssetUtils>('fetchAssetIds') ||
		findByProps<AssetUtils>('getAssetIds')
	const isLink = /^https?:\/\//i.test(v)
	if (isLink) v = await versionedLink(await findImageUrl(v))
	const wanted = v

	/** Asks Discord's web API to host the link. */
	async function viaDiscordApi(): Promise<string | undefined> {
		const key = `link|${wanted}`
		const cached = assetCache.get(key)
		if (cached !== undefined) {
			setImageStatus(slot, 'ok')
			return cached
		}
		try {
			const id = await externalAsset(wanted, appId)
			assetCache.set(key, id)
			setImageStatus(slot, 'ok')
			return id
		} catch (error) {
			setImageStatus(slot, errorText(error))
			return undefined
		}
	}

	/** Looks an asset key up in the application's public asset list. */
	async function viaAssetList(): Promise<string | undefined> {
		const apps = appId && appId !== '0' ? [appId, IMAGE_APP_ID] : [IMAGE_APP_ID]
		for (const app of apps) {
			const key = `${app}|${wanted}`
			const cached = assetCache.get(key)
			if (cached !== undefined) {
				setImageStatus(slot, 'ok')
				return cached
			}
			try {
				const res = await fetch(
					`https://discord.com/api/v9/oauth2/applications/${app}/assets`,
				)
				if (!res.ok) continue
				const assets = (await res.json()) as Array<{
					name?: string
					id?: string
				}>
				const hit = Array.isArray(assets)
					? assets.filter(a => a && (a.name === wanted || a.id === wanted))[0]
					: undefined
				if (hit?.id) {
					assetCache.set(key, hit.id)
					setImageStatus(slot, 'ok')
					return hit.id
				}
			} catch {
				// Try the next application.
			}
		}
		setImageStatus(
			slot,
			`No image called "${wanted}" was found for this Application ID`,
		)
		return undefined
	}

	if (!utils) return isLink ? viaDiscordApi() : viaAssetList()

	const candidates =
		appId && appId !== '0' ? [appId, IMAGE_APP_ID] : [IMAGE_APP_ID]
	let error: string | undefined
	for (const app of candidates) {
		const key = `${app}|${wanted}`
		const cached = assetCache.get(key)
		if (cached !== undefined) {
			setImageStatus(slot, 'ok')
			return cached
		}
		try {
			let ids: string[] | undefined
			try {
				ids = utils.getAssetIds?.(app, [wanted])
			} catch {
				// Asked below instead.
			}
			// `getAssetIds` answers `[null]`, not `[]`, for an image it has not seen once the application's art assets are loaded
			// (they are as soon as any profile uses an asset key). That is no answer, so Discord is asked, under this application.
			if (!ids?.[0]) ids = await utils.fetchAssetIds?.(app, [wanted])
			const id = ids?.[0]
			if (id) {
				assetCache.set(key, id)
				setImageStatus(slot, 'ok')
				return id
			}
			error = 'Discord returned no image for this link'
		} catch (e) {
			error = errorText(e)
			console.warn(`${TAG} could not resolve image:`, error)
		}
	}
	if (isLink) return viaDiscordApi()
	if (appId && appId !== '0') return viaAssetList()
	setImageStatus(slot, error || 'Could not load this image')
	return undefined
}

/**
 * Turns the link of a cover into an asset id Discord can show. A SoundCloud cover is asked for in its large size.
 * The same image is only hosted once.
 *
 * @returns The asset id, or nothing if there is no link or Discord would not host it (this is logged).
 */
export async function artworkAsset(url: string): Promise<string | undefined> {
	if (!url) return undefined
	const big = url.replace('-large.', '-t500x500.')
	const key = `link|${big}`
	const cached = assetCache.get(key)
	if (cached !== undefined) return cached
	try {
		const id = await externalAsset(big)
		assetCache.set(key, id)
		return id
	} catch (error) {
		console.warn(`${TAG} artwork not sent:`, errorText(error))
		return undefined
	}
}
