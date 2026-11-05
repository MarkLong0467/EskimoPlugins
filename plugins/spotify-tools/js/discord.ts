import { ToastActionCreators } from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { TOAST_KEY } from './constants'
import type { ComponentType } from 'react'
import type { Rest } from './types'

/** One of Discord's Flux stores by name, described by the type the caller gives. Nothing if Discord has no such store. */
export function store<T>(name: string): T | undefined {
	return Stores[name] as unknown as T | undefined
}

/** Every Discord module that has all the given properties, described by the type the caller gives. */
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

/** Discord's connection to its web API: the module with `get`, `post` and `patch`, or else the one with `HTTPResponseError`. */
export function rest(): Rest | undefined {
	return (
		findByProps<Rest>('get', 'post', 'patch') ||
		findByProps<Rest>('HTTPResponseError', 'get')
	)
}

/** The first of Discord's icon components that exists, tried in the given order. */
export function findIcon(
	names: string[],
): ComponentType<{ size?: string }> | undefined {
	for (const name of names) {
		const icon = lookupGeneratedIconComponent(name)
		if (icon) return icon as unknown as ComponentType<{ size?: string }>
	}
	return undefined
}

/** The text of an error. */
export const errorText = (error: unknown): string =>
	String((error as { message?: unknown } | undefined)?.message || error)
