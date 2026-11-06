import { chromaAt, clamp, lchOf, normaliseHex, toneHex } from './color'
import type { MaterialMode } from '../types'

type Family =
	| 'primary'
	| 'secondary'
	| 'tertiary'
	| 'error'
	| 'neutral'
	| 'neutralVariant'

export type SchemeFamily = Family

/** Rough Material 3 error hue, from the spec's own `#B3261E`. */
const ERROR_HUE = lchOf('#b3261e').h
const FALLBACK_SEED = '#6750a4'

interface Palette {
	hue: Record<Family, number>
	chroma: Record<Family, number>
}

const paletteCache = new Map<string, Palette>()

/**
 * The Material families one seed spends: hue per family, plus the chroma
 * budget each family is allowed at its peak tone. The seed only decides hue
 * and chroma — lightness always comes from the colour being repainted.
 */
export function paletteFor(mode: MaterialMode, seed: string): Palette {
	const hex = normaliseHex(seed, FALLBACK_SEED)
	const key = `${mode}:${hex}`
	const hit = paletteCache.get(key)
	if (hit) return hit

	const { c: seedChroma, h } = lchOf(hex)
	const primaryBase =
		mode === 'dark'
			? clamp(seedChroma * 1.4, 44, 60)
			: clamp(seedChroma * 1.1, 34, 48)

	const palette: Palette = {
		chroma: {
			primary: primaryBase,
			secondary: primaryBase * 0.4,
			tertiary: primaryBase * 0.72,
			error: 48,
			neutral: 12,
			neutralVariant: 16,
		},
		hue: {
			primary: h,
			secondary: h,
			tertiary: (h + 60) % 360,
			error: ERROR_HUE,
			neutral: h,
			neutralVariant: h,
		},
	}
	paletteCache.set(key, palette)
	return palette
}

/**
 * One colour from a Material family at an arbitrary tone, used both by the
 * repaint engine and by the options preview.
 */
export function toneIn(
	mode: MaterialMode,
	seed: string,
	family: SchemeFamily,
	tone: number,
): string {
	const palette = paletteFor(mode, seed)
	return toneHex(
		palette.hue[family],
		chromaAt(palette.chroma[family], tone),
		tone,
	)
}

/** Fixed sample points for the options preview strip, lightness per mode. */
const STRIP: { family: SchemeFamily; dark: number; light: number }[] = [
	{ family: 'primary', dark: 80, light: 40 },
	{ family: 'primary', dark: 20, light: 100 },
	{ family: 'primary', dark: 30, light: 90 },
	{ family: 'primary', dark: 90, light: 10 },
	{ family: 'secondary', dark: 30, light: 90 },
	{ family: 'secondary', dark: 90, light: 10 },
	{ family: 'neutral', dark: 14, light: 94 },
	{ family: 'neutral', dark: 92, light: 10 },
	{ family: 'neutralVariant', dark: 30, light: 80 },
	{ family: 'error', dark: 80, light: 40 },
]

/** Ten sample colours across the families, for the palette preview. */
export function previewStrip(mode: MaterialMode, seed: string): string[] {
	return STRIP.map(step => toneIn(mode, seed, step.family, step[mode]))
}
