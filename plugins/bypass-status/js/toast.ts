import { ToastActionCreators } from '@valenced/discord/actions'
import { TOAST_KEY } from './constants'

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: unknown): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text: String(text) })
	} catch {
		// Toasts are a convenience.
	}
}
