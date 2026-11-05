import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { TAG } from './constants'
import { assetCache } from './state'

/** Discord's connection to its web API. */
interface Http {
	post?(options: {
		url: string
		body: unknown
	}): Promise<{ body?: unknown } | undefined>
}

/** Finds a module by the functions it has, described by the type the caller gives. */
const findByProps = <T>(...props: string[]): T | undefined =>
	lookupModule(
		(withProps as (...names: string[]) => ReturnType<typeof withProps>)(
			...props,
		),
	)[0] as unknown as T | undefined

/**
 * Asks Discord to host an image link for use in a presence.
 *
 * Discord's own connection is used when it can be found, and otherwise a plain request with the account token.
 *
 * @returns An `mp:` asset id.
 */
async function externalAsset(url: string): Promise<string> {
	const path = '/applications/0/external-assets'
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
 * Turns the link of a cover into an asset id Discord can show. A SoundCloud cover is asked for in its large size.
 * The same image is only hosted once.
 *
 * @returns The asset id, or nothing if there is no link or Discord would not host it (this is logged).
 */
export async function artworkAsset(url: string): Promise<string | undefined> {
	if (!url) return undefined
	const big = url.replace('-large.', '-t500x500.')
	const cached = assetCache.get(big)
	if (cached !== undefined) return cached
	try {
		const id = await externalAsset(big)
		assetCache.set(big, id)
		return id
	} catch (error) {
		const e = error as
			| { body?: { message?: unknown }; message?: unknown }
			| undefined
		console.warn(
			`${TAG} artwork not sent:`,
			String((e && ((e.body && e.body.message) || e.message)) || error),
		)
		return undefined
	}
}
