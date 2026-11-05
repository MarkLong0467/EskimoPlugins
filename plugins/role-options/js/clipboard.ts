import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { Platform } from 'react-native'
import { roleIconUrl } from './constants'
import { toast } from './toast'
import type { Role } from './types'

/** The clipboard functions used here. `setImage` only exists where the clipboard library can put a picture on it. */
interface ClipboardApi {
	setString(value: string): void
	setImage?(base64: string): void
}

const clipboard = () => Clipboard as unknown as ClipboardApi

/** Puts text on the clipboard. */
export function copyText(text: string): void {
	clipboard().setString(text)
}

/**
 * Runs Discord's own "Copy Role ID" action, but keeps the id it copies instead of letting it land in the clipboard.
 *
 * `Clipboard.setString` is replaced for the moment the action runs, and always put back, even if the action throws.
 * That is how the plugin learns which role a menu is about, because the menu item itself does not say.
 *
 * @param press The action of Discord's "Copy Role ID" item.
 * @returns The id, if the action copied something that looks like one (5 or more digits), otherwise nothing.
 */
export function captureId(press: () => unknown): string | undefined {
	const api = clipboard()
	const original = api.setString
	let id: unknown
	api.setString = (value: string) => {
		id = value
	}
	try {
		press()
	} catch {
		// If Discord's action fails there is simply no id.
	} finally {
		api.setString = original
	}
	return typeof id === 'string' && /^\d{5,}$/.test(id) ? id : undefined
}

/** Reads a picture from a link and returns it as base64 text. */
function downloadAsBase64(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		fetch(url)
			.then(response => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`)
				return response.blob()
			})
			.then(blob => {
				const reader = new FileReader()
				reader.onloadend = () => resolve(String(reader.result).split(',')[1])
				reader.onerror = () => reject(reader.error)
				reader.readAsDataURL(blob)
			})
			.catch(reject)
	})
}

/**
 * Copies a role's icon.
 *
 * The clipboard library can only put a picture itself on the clipboard on iOS. On Android, and anywhere without
 * `setImage`, the link to the picture is copied instead and the toast says so.
 */
export async function copyIcon(role: Role): Promise<void> {
	if (!role.icon) return toast('That role has no icon')

	const url = roleIconUrl(role.id, role.icon)
	const api = clipboard()
	const android = !!(Platform && Platform.OS === 'android')
	if (android || typeof api.setImage !== 'function') {
		api.setString(url)
		return toast('This phone cannot copy pictures, copied the icon link')
	}

	api.setImage(await downloadAsBase64(url))
	toast('Copied the role icon')
}
