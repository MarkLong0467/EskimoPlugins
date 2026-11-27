import { getAssetIdByName } from '@valenced/assets'
import { openToast } from '../../../shared/kmmiio/toast'

/** The id of the toasts this plugin shows. */
const TOAST_KEY = 'MARKLONG_CALL_BATTERY_SAVER'

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		openToast(TOAST_KEY, text)
	} catch {
		// Toasts are a convenience.
	}
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
