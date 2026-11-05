import { getAssetIdByName } from '@valenced/assets'
import { ToastActionCreators } from '@valenced/discord/actions'
import { TOAST_KEY } from './constants'

/** Shows a toast with a copy icon. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		const icon = getAssetIdByName('ic_message_copy')
		ToastActionCreators.open(
			TOAST_KEY,
			icon ? { text, icon: icon as never } : { text },
		)
	} catch {
		// Toasts are a convenience.
	}
}
