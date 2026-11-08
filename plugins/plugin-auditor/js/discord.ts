import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { Linking } from 'react-native'
import { openToast } from '../../../shared/kmmiio/toast'
import { TOAST_KEY } from './constants'

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	openToast(TOAST_KEY, text)
}

/** Discord's action sheet functions (open and close the bottom sheets). */
export const sheets = () => ActionSheetActionCreators

/** Puts text on the clipboard. Returns whether that worked. */
export function copy(text: string): boolean {
	try {
		Clipboard.setString(text)
		return true
	} catch {
		return false
	}
}

/** Opens a link in the browser. Returns whether the phone took it. */
export async function open(url: string): Promise<boolean> {
	try {
		await Linking.openURL(url)
		return true
	} catch {
		return false
	}
}
