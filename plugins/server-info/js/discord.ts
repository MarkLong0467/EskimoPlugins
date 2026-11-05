import { getAssetIdByName } from '@valenced/assets'
import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { TOAST_KEY } from './constants'
import type { Rest } from './types'

/** One of Discord's Flux stores by name, described by the type the caller gives. Nothing if Discord has no such store. */
export function store<T>(name: string): T | undefined {
	return Stores[name] as unknown as T | undefined
}

/** The first Discord module that has all the given properties, described by the type the caller gives. */
export function findByProps<T>(...props: string[]): T | undefined {
	return lookupModule(
		(withProps as (...names: string[]) => ReturnType<typeof withProps>)(
			...props,
		),
	)[0] as unknown as T | undefined
}

/** Discord's action sheet functions (open and close the bottom sheets). */
export const sheets = () => ActionSheetActionCreators

/** The id of one of Discord's icons by name, or nothing if there is no such icon. */
export function asset(name: string): number | undefined {
	const id = getAssetIdByName(name)
	return id == null ? undefined : id
}

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text })
	} catch {
		// Toasts are a convenience.
	}
}

/** A failed answer from Discord's web API: its status and, if it sent one, its message. */
export interface ApiError extends Error {
	status?: number
	body?: { message?: unknown }
}

/**
 * Asks Discord's web API for something and gives back the answer's body.
 *
 * Discord's own connection is used (the module with `HTTPResponseError`, which also adds the right headers). If that cannot
 * be found, or it breaks without Discord having answered, a plain request with the account token is sent instead.
 * (A module found only by having `get` and `post` can be a native one that rejects these calls, so it is not used.)
 *
 * @param path The path after `/api/v9`, for example `/guilds/123`.
 * @param query Query parameters, if any.
 * @throws An error with the `status` when Discord answered no.
 */
export async function apiGet(
	path: string,
	query?: Record<string, unknown>,
): Promise<unknown> {
	const http = findByProps<Rest>('HTTPResponseError', 'get')
	if (http && typeof http.get === 'function') {
		try {
			const res = await http.get({ url: path, ...(query ? { query } : {}) })
			return res?.body
		} catch (error) {
			// An answer from Discord (an error with a status or body) is passed on; anything else tries the plain request.
			const e = error as { status?: unknown; body?: unknown } | undefined
			if (e && (e.status != null || e.body != null)) throw error
		}
	}
	const token = findByProps<{ getToken?: () => string | undefined }>(
		'getToken',
	)?.getToken?.()
	if (!token) throw new Error('no way to reach Discord')
	const qs = query
		? `?${Object.keys(query)
				.map(k => `${k}=${encodeURIComponent(String(query[k]))}`)
				.join('&')}`
		: ''
	const res = await fetch(`https://discord.com/api/v9${path}${qs}`, {
		headers: { Authorization: token },
	})
	if (!res.ok) {
		const error: ApiError = new Error(`Discord said no (${res.status})`)
		error.status = res.status
		throw error
	}
	return res.json()
}

/**
 * Opens a user's profile.
 *
 * Discord's code for it has had several names, so each is tried until one works. The sheet that is open is closed
 * first. If none works, a toast says so.
 */
export function openProfile(userId: string, guildId: string): void {
	try {
		sheets().hideAllActionSheets()
	} catch {
		// Nothing was open.
	}
	const args = { userId, guildId }
	for (const name of [
		'openUserProfileModal',
		'openUserProfile',
		'showUserProfile',
	]) {
		const module = findByProps<Record<string, unknown>>(name)
		if (module && typeof module[name] === 'function') {
			try {
				;(module[name] as (args: unknown) => void)(args)
				return
			} catch {
				// Try the next name.
			}
		}
	}
	toast("Couldn't open this profile.")
}
