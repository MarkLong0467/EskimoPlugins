import { getAssetIdByName } from '@valenced/assets'
import {
	ActionSheetActionCreators,
	ToastActionCreators,
} from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
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

/** Copies text and says so with a toast. Nothing is announced when the copy fails. */
export function copy(text: string, said: string): void {
	try {
		Clipboard.setString(text)
		toast(said)
	} catch {
		// Nothing was copied, so nothing is announced.
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

/** A user as Discord's web API describes one. */
export interface ApiUser {
	id: string
	username: string
	global_name?: string | null
	avatar?: string | null
}

/** Whether something is a user: it has an id and a name (an error answer has neither). */
function isUser(value: unknown, id: string): value is ApiUser {
	const user = value as Partial<ApiUser> | null | undefined
	return (
		!!user &&
		typeof user.username === 'string' &&
		!!user.username &&
		String(user.id) === id
	)
}

/**
 * Asks Discord's web API who a user is.
 *
 * The profile route is tried first (the one the app itself uses, which accounts may call), then the plain user route. Only an
 * answer that really is a user is accepted: Discord also answers with errors that have a message and no name.
 *
 * @throws If neither route gave a user.
 */
export async function fetchUser(
	userId: string,
	guildId?: string,
): Promise<ApiUser> {
	const routes: Array<
		[string, Record<string, unknown> | undefined, (body: unknown) => unknown]
	> = [
		[
			`/users/${userId}/profile`,
			{ with_mutual_guilds: false, ...(guildId ? { guild_id: guildId } : {}) },
			body => (body as { user?: unknown } | undefined)?.user,
		],
		[`/users/${userId}`, undefined, body => body],
	]
	let last: unknown
	for (const [path, query, pick] of routes) {
		try {
			const user = pick(await apiGet(path, query))
			if (isUser(user, userId)) return user
			last = new Error('no user in the answer')
		} catch (error) {
			last = error
		}
	}
	throw last
}

/**
 * Opens a user's profile.
 *
 * The profile is a sheet, opened by Discord's `showUserProfileActionSheet` (found by its exports); the older names it has had
 * are tried after it. The sheet that is open is closed first. If none works, a toast says so.
 */
export function openProfile(userId: string, guildId: string): void {
	try {
		sheets().hideAllActionSheets()
	} catch {
		// Nothing was open.
	}
	const args = { userId, guildId }
	const sheet = findByProps<unknown>(
		'USER_PROFILE_ACTION_SHEET_KEY_PREFIX',
		'getUserProfileActionSheetKey',
	)
	const shower =
		typeof sheet === 'function'
			? sheet
			: (sheet as { default?: unknown } | undefined)?.default
	if (typeof shower === 'function') {
		try {
			;(shower as (args: unknown) => void)(args)
			return
		} catch {
			// Try the other ways.
		}
	}
	for (const name of [
		'openUserProfile',
		'openUserProfileModal',
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
