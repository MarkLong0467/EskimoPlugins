import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { openToast } from '../../../shared/kmmiio/toast'
import type { ComponentType } from 'react'

/** The id of the toasts this plugin shows. */
const TOAST_KEY = 'MARKLONG_BETTER_CALLS'

/** The id of the sheet that picks the audio output device. */
export const DEVICE_SHEET_KEY = 'marklong.better-calls.audio-output-devices'

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		openToast(TOAST_KEY, text)
	} catch {
		// Toasts are a convenience.
	}
}

/** Discord's action sheet functions (open and close the bottom sheets). */
export const sheets = () => ActionSheetActionCreators

/** The first of Discord's icon components that exists, tried in the given order. */
export function findIcon(
	names: string[],
): ComponentType<{ size?: string }> | undefined {
	for (const name of names) {
		try {
			const icon = lookupGeneratedIconComponent(name)
			if (icon) return icon as unknown as ComponentType<{ size?: string }>
		} catch {
			// Try the next name.
		}
	}
	return undefined
}

/** The id of the first of Discord's icons that exists, tried in the given order. */
export function findAsset(names: string[]): number | undefined {
	for (const name of names) {
		try {
			const id = getAssetIdByName(name)
			if (id != null) return id
		} catch {
			// Try the next name.
		}
	}
	return undefined
}

/** One of Discord's Flux stores by name. Nothing if Discord has no such store. */
export function store<T>(name: string): T | undefined {
	try {
		return (Stores as unknown as Record<string, T | undefined>)[name]
	} catch {
		return undefined
	}
}
