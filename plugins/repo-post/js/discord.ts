import { Stores } from '@valenced/discord/flux'
import { openToast } from '../../../shared/kmmiio/toast'
import { TOAST_KEY } from './constants'

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		openToast(TOAST_KEY, text)
	} catch {
		// Toasts are a convenience.
	}
}

/** You, as Discord's user store knows you. */
interface CurrentUser {
	id?: string
	premiumType?: number
}

/** The account that is logged in, or nothing if Discord has not loaded it yet. */
export function currentUser(): CurrentUser | undefined {
	try {
		return (
			Stores as unknown as {
				UserStore?: { getCurrentUser?(): CurrentUser | undefined }
			}
		).UserStore?.getCurrentUser?.()
	} catch {
		return undefined
	}
}
