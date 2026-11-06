import { isMaterialTheme } from '../defaults'
import { rawHex } from './catalog'
import { chromaAt, parseHex8, rgbToLab, toneHex, withAlpha } from './color'
import { paletteFor } from './scheme'
import { intentOf } from './semantics'
import { getSettings } from './settings'
import { getSemanticColors, getTheme } from './tokens'
import type { MaterialMode } from '../types'
import type { Intent } from './semantics'

/**
 * The repaint engine: one rule for every colour.
 *
 * Keep the original's exact composite lightness and alpha, and replace its
 * hue and chroma with the Material family its intent names. `pass` colours
 * stay Discord's own value. Nothing else — no tone tables, no bands, no
 * invented alphas — so contrast between any two colours is whatever Discord
 * shipped.
 */

const paintCache = new Map<string, string>()
const intentCache = new Map<string, Intent>()

/** Whether repaints show at all: our theme is active and the master switch is on. */
export function repaintActive(theme?: string): boolean {
	const key = theme ?? getTheme()
	return isMaterialTheme(key) && getSettings().enabled
}

export function clearPaintCache(): void {
	paintCache.clear()
}

/** A raw colour's intent, from its own name (`RED_400` → critical, …). */
export function rawIntent(name: string): Intent {
	const hit = intentCache.get(name)
	if (hit !== undefined) return hit
	const value = intentOf(name)
	intentCache.set(name, value)
	return value
}

/**
 * A semantic token's intent: its own name first (so `TEXT_BRAND` is brand
 * even when it points at a red), then the name of the colour it points at
 * (so `BG_BASE_PRIMARY`, Discord's grey ramp, stays neutral).
 */
export function semanticIntent(name: string, reference: string): Intent {
	const own = intentOf(name)
	return own !== 'neutral' ? own : intentOf(reference)
}

/** Repaint one colour: same lightness, same alpha, Material family swapped in. */
export function paintHex(
	original: string,
	intent: Intent,
	mode: MaterialMode,
	seed: string,
): string {
	if (intent === 'pass') return original
	const parsed = parseHex8(original)
	if (parsed == null) return original

	const cacheKey = `${mode}|${intent}|${seed}|${original}`
	const hit = paintCache.get(cacheKey)
	if (hit !== undefined) return hit

	const palette = paletteFor(mode, seed)
	const family =
		intent === 'brand' ? 'primary' : intent === 'critical' ? 'error' : 'neutral'
	const { l } = rgbToLab(parsed.rgb)
	let hex = toneHex(palette.hue[family], chromaAt(palette.chroma[family], l), l)
	if (parsed.alpha < 1) hex = withAlpha(hex, parsed.alpha)

	paintCache.set(cacheKey, hex)
	return hex
}

/** Repaint one raw colour, judged by its own name. */
export function paintRaw(
	name: string,
	original: string,
	mode: MaterialMode,
	seed: string,
): string {
	return paintHex(original, rawIntent(name), mode, seed)
}

function referenceEntry(def: any, refKey: 'light' | 'darker'): any {
	return refKey === 'light'
		? (def.light ?? def.darker ?? def.dark)
		: (def.darker ?? def.dark ?? def.midnight)
}

/**
 * Build one theme key's explicit semantic map: token name → `{raw: hex,
 * opacity}` with the hex already painted. Tokens whose reference slot is a
 * gradient (or missing) are left out, so the resolver falls back to the
 * reference theme's own value for them — gradients are `pass` colours.
 */
export function buildSemanticEntries(
	mode: MaterialMode,
	seed: string,
): Map<string, any> {
	const out = new Map<string, any>()
	const table = getSemanticColors()
	if (table == null) return out

	const refKey: 'light' | 'darker' = mode === 'light' ? 'light' : 'darker'
	for (const name of Object.keys(table)) {
		const def = table[name]
		if (def == null || typeof def !== 'object') continue
		const ref = referenceEntry(def, refKey)
		if (ref == null || typeof ref !== 'object') continue
		if (typeof ref.raw !== 'string') continue
		const original = rawHex(ref.raw)
		if (original === undefined) continue
		const intent = semanticIntent(name, ref.raw)
		out.set(name, {
			raw: paintHex(original, intent, mode, seed),
			opacity: typeof ref.opacity === 'number' ? ref.opacity : 1,
		})
	}
	return out
}
