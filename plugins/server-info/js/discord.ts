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

/** Discord's connection to its web API: the module with `get`, `post` and `patch`, or else the one with `HTTPResponseError`. */
export function rest(): Rest | undefined {
	return (
		findByProps<Rest>('get', 'post', 'patch') ||
		findByProps<Rest>('HTTPResponseError', 'get')
	)
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
