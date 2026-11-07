/**
 * Who a silenced person is. Discord's user store knows the people it has met; for anyone else the name is asked from Discord's
 * web API (the same way the Server Info plugin finds a server owner) and kept in memory.
 */

import { Stores } from '@valenced/discord/flux'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { diag } from './diag'
import { state } from './state'

/** The words a row can show for a person. */
export interface Person {
	id: string
	/** The name to show: the display name, or the username, or a short form of the id. */
	name: string
	/** The username with an @, or nothing when it is not known. */
	handle?: string
	/** The link to the picture. */
	avatar: string
	/** Whether Discord has told us who this is. */
	known: boolean
}

/** A user in Discord's user store, as far as this file reads one. */
interface StoreUser {
	id?: string
	username?: string
	globalName?: string | null
	avatar?: string | null
}

/** The user store, if Discord has it. */
const userStore = () =>
	(
		Stores as unknown as Record<
			string,
			| {
					getUser?(id: string): StoreUser | undefined
					getCurrentUser?(): StoreUser | undefined
			  }
			| undefined
		>
	).UserStore

/** Your own id, or nothing when it cannot be read yet. */
export function myId(): string | undefined {
	try {
		const id = userStore()?.getCurrentUser?.()?.id
		if (id) state.meKnown = true
		return id ? String(id) : undefined
	} catch {
		return undefined
	}
}

/** The picture of a user: theirs, or one of Discord's six plain ones when they have none. */
export function avatarOf(id: string, hash: string | null | undefined): string {
	if (!hash)
		return `https://cdn.discordapp.com/embed/avatars/${Math.floor(Number(id) / 4194304) % 6}.png`
	return `https://cdn.discordapp.com/avatars/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=64`
}

/** A short form of an id for people Discord has not told us about: the start and the end. */
export function shortId(id: string): string {
	return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
}

/** Who a person is, from the user store or from what was looked up. */
export function personOf(id: string): Person {
	let user: StoreUser | undefined
	try {
		user = userStore()?.getUser?.(id)
	} catch {
		user = undefined
	}
	if (user?.username) {
		return {
			id,
			name: user.globalName || user.username,
			handle: `@${user.username}`,
			avatar: avatarOf(id, user.avatar),
			known: true,
		}
	}
	const asked = state.names.get(id)
	if (asked) {
		return {
			id,
			name: asked.name,
			handle: asked.username ? `@${asked.username}` : undefined,
			avatar: avatarOf(id, asked.avatar),
			known: true,
		}
	}
	return {
		id,
		name: `Unknown user ${shortId(id)}`,
		avatar: avatarOf(id, null),
		known: false,
	}
}

/** Something with named fields. */
type Bag = Record<string, unknown>

/** The first of Discord's modules that has all of these. */
function find<T>(...props: string[]): T | undefined {
	try {
		const found = lookupModule(
			(withProps as (...names: string[]) => ReturnType<typeof withProps>)(
				...props,
			),
		) as unknown as unknown[]
		return found[0] as T | undefined
	} catch {
		return undefined
	}
}

/** Asks Discord's web API for something. Discord's own connection first, then a plain request with the account token. */
async function apiGet(path: string): Promise<unknown> {
	const http = find<{
		get?(options: { url: string }): Promise<{ body?: unknown } | undefined>
	}>('HTTPResponseError', 'get')
	if (http && typeof http.get === 'function') {
		try {
			const res = await http.get({ url: path })
			return res?.body
		} catch (error) {
			const e = error as { status?: unknown; body?: unknown } | undefined
			if (e && (e.status != null || e.body != null)) throw error
		}
	}
	const token = find<{ getToken?: () => string | undefined }>(
		'getToken',
	)?.getToken?.()
	if (!token) throw new Error('no way to reach Discord')
	const res = await fetch(`https://discord.com/api/v9${path}`, {
		headers: { Authorization: token },
	})
	if (!res.ok) throw new Error(`Discord said no (${res.status})`)
	return res.json()
}

/** Ids that are being asked about now, so each is asked once. */
const asking = new Set<string>()

/**
 * Asks Discord who a user is and remembers the answer.
 *
 * @returns Whether a name was found.
 */
export async function lookupUser(id: string): Promise<boolean> {
	if (state.names.has(id) || asking.has(id)) return state.names.has(id)
	asking.add(id)
	try {
		for (const path of [`/users/${id}/profile`, `/users/${id}`]) {
			try {
				const body = (await apiGet(path)) as Bag | undefined
				const user = (isUser(body?.user) ? body?.user : body) as Bag | undefined
				if (
					user &&
					typeof user.username === 'string' &&
					String(user.id) === id
				) {
					state.names.set(id, {
						name: String(user.global_name || user.username),
						username: user.username,
						avatar: typeof user.avatar === 'string' ? user.avatar : null,
					})
					return true
				}
			} catch {
				// Try the next route.
			}
		}
		return false
	} catch (error) {
		diag.fail('look up a user', error)
		return false
	} finally {
		asking.delete(id)
	}
}

/** Whether a value looks like a user. */
function isUser(value: unknown): value is Bag {
	return (
		value != null &&
		typeof value === 'object' &&
		typeof (value as Bag).username === 'string'
	)
}

/** Copies text. Returns whether it worked. */
export function copyText(text: string): boolean {
	try {
		Clipboard.setString(text)
		return true
	} catch {
		return false
	}
}
