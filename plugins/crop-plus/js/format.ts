import { ToastActionCreators } from '@valenced/discord/actions'
import { TOAST_KEY } from './constants'
import type { CropResult } from './types'

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: unknown): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text: String(text) })
	} catch {
		// Toasts are a convenience.
	}
}

/** Waits for a number of milliseconds. */
export const sleep = (ms: number) =>
	new Promise<void>(resolve => setTimeout(resolve, ms))

/** A file size in words: `250 KB` or `1.2 MB`. Nothing if the size is not known. */
export function sizeText(bytes: unknown): string {
	const n = Number(bytes)
	if (!Number.isFinite(n) || n <= 0) return ''
	return n >= 1048576
		? `${(n / 1048576).toFixed(1)} MB`
		: `${Math.max(1, Math.round(n / 1024))} KB`
}

/** A picture's size in words: `500 × 400`. */
export function dims(
	result: Pick<CropResult, 'width' | 'height'> | null | undefined,
): string {
	return result?.width && result.height
		? `${result.width} × ${result.height}`
		: 'unknown size'
}

/** The longest side of a result in pixels, or 0 if it has no size. */
export function longestSide(
	result: Pick<CropResult, 'width' | 'height'>,
): number {
	return Math.max(Number(result.width) || 0, Number(result.height) || 0)
}
