import { getAssetIdByName } from '@valenced/assets'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { TOAST_KEY } from './constants'
import type { Context } from 'react'

/** What Discord's accessibility context holds, as far as used here. */
export type MotionValue = { reducedMotion?: { enabled?: boolean } } | undefined

import type { ApiError, Http } from './types'

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

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text })
	} catch {
		// Toasts are a convenience.
	}
}

/** The id of one of Discord's icons by name, or nothing if there is no such icon. */
export function asset(name: string): number | undefined {
	const id = getAssetIdByName(name)
	return id == null ? undefined : id
}

/** The text of an error: Discord's message if it sent one. */
export function errorText(error: unknown): string {
	const e = error as ApiError | undefined
	return String(e?.body?.message || e?.message || error)
}

/**
 * Sends a PUT request to Discord's web API.
 *
 * Discord's own connection is used (the module with `HTTPResponseError`, which also adds the right headers). If that cannot
 * be found, or it breaks without Discord having answered, a plain request with the account token is sent instead.
 *
 * @param path The path after `/api/v9`.
 * @throws An error with the `status` (and Discord's `body`) when Discord answered no.
 */
export async function apiPut(path: string): Promise<void> {
	const http = findByProps<Http>('HTTPResponseError', 'put')
	if (http && typeof http.put === 'function') {
		try {
			await http.put({ url: path })
			return
		} catch (error) {
			// An answer from Discord (an error with a status or body) is passed on; anything else tries the plain request.
			const e = error as ApiError | undefined
			if (e && (e.status != null || e.body != null)) throw error
		}
	}
	const token = findByProps<{ getToken?: () => string | undefined }>(
		'getToken',
	)?.getToken?.()
	if (!token) throw new Error('no way to reach Discord')
	const res = await fetch(`https://discord.com/api/v9${path}`, {
		method: 'PUT',
		headers: { Authorization: token },
	})
	if (!res.ok) {
		const error: ApiError = new Error(`Discord said no (${res.status})`)
		error.status = res.status
		try {
			error.body = await res.json()
		} catch {
			// No body.
		}
		throw error
	}
}

/** Discord's accessibility context: its  makes sheets open without their slide animation. */
export function motionContext(): Context<MotionValue> | undefined {
	return findByProps<{
		AccessibilityPreferencesContext?: Context<MotionValue>
	}>('AccessibilityPreferencesContext')?.AccessibilityPreferencesContext
}
