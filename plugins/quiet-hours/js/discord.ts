import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Vibration } from 'react-native'
import { openToast } from '../../../shared/kmmiio/toast'
import { setting } from './config'
import { TOAST_KEY } from './constants'

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		openToast(TOAST_KEY, text)
	} catch {
		// Toasts are a convenience.
	}
}

/** A short vibration, if the setting asks for it. */
export function buzz(): void {
	try {
		if (setting('buzz')) Vibration.vibrate(15)
	} catch {
		// No vibration on this phone.
	}
}

/** Discord's action sheet functions (open and close the bottom sheets). */
export const sheets = () => ActionSheetActionCreators
