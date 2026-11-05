import { ToastActionCreators } from '@valenced/discord/actions'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { TOAST_KEY } from './constants'
import { note } from './state'

/** An error as text: its message, or the value itself. */
export function errorText(error: unknown): string {
	return String((error as { message?: unknown } | undefined)?.message || error)
}

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: unknown): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text: String(text) })
	} catch {
		// Toasts are a convenience.
	}
}

/** Copies text to the clipboard and says so in a toast. */
export function copyText(text: string, what?: string): void {
	try {
		Clipboard.setString(text)
		toast(`${what || 'Text'} copied`)
	} catch {
		toast('Could not copy')
	}
}

/** Runs one step of setting up. If it fails the failure goes in the log and the other steps still run. */
export function attempt(label: string, step: () => void): void {
	try {
		step()
	} catch (error) {
		note(`${label} failed: ${errorText(error)}`)
	}
}

/** The first two arguments of a call as short text for the log: strings and numbers as they are, others by type. */
export function shortArgs(args: ArrayLike<unknown>): string {
	try {
		return Array.prototype.slice
			.call(args, 0, 2)
			.map((arg: unknown) =>
				typeof arg === 'string' || typeof arg === 'number'
					? String(arg)
					: typeof arg,
			)
			.join(', ')
	} catch {
		return ''
	}
}
