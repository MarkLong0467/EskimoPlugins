let revision = 0
let baseSaturation: number | undefined

function dispatcher(): any {
	const flux = (valenced as any).discord?.flux
	return flux?.Dispatcher ?? (valenced as any).discord?.common?.flux?.Dispatcher
}

function accessibilityStore(): any {
	return (valenced as any).discord?.flux?.Stores?.AccessibilityStore
}

/**
 * Every themed style cache is keyed on the theme context, whose key is a JSON
 * dump of `{theme, saturation, contrast, density, ...}`. Moving `saturation`
 * by a millionth rewrites that key, so the next render recomputes every
 * `createStyles` and `useToken` entry against the new palette. The nudge is
 * far too small to see.
 */
export function flushThemeCaches(): void {
	try {
		if (baseSaturation === undefined) {
			const current = accessibilityStore()?.saturation
			baseSaturation = typeof current === 'number' ? current : 1
		}
		revision += 1
		const next = Math.max(baseSaturation - revision * 1e-6, 1e-6)
		dispatcher()?.dispatch?.({
			type: 'ACCESSIBILITY_SET_SATURATION',
			saturation: next,
		})
	} catch {
		// The palette stays correct for anything that renders from here on.
	}
}

/**
 * Move off the cached key for the user's saturation without touching it.
 *
 * Restoring the exact value would hand renders back the key the palette was
 * written under, so anything cached there would come back as Material colours
 * with the overlay gone. One millionth away keeps the user's setting and gives
 * Discord an untouched key to refill from.
 */
export function restoreSaturation(): void {
	if (baseSaturation === undefined) return
	try {
		dispatcher()?.dispatch?.({
			type: 'ACCESSIBILITY_SET_SATURATION',
			saturation: baseSaturation + 1e-6,
		})
	} catch {}
	revision = 0
}
