/**
 * Reads a colour's intent out of a name.
 *
 * There is no per-token table here: names carry the intent (brand, danger,
 * status), and everything else is neutral — the family swap then keeps the
 * original lightness and only changes hue and chroma.
 *
 * Intent is decided from the name being painted: a semantic token asks its
 * own name first, then falls back to the name of the raw colour it points
 * at, so `BG_BASE_PRIMARY` (Discord's grey ramp) stays neutral while
 * `REDESIGN_BUTTON_PRIMARY_BACKGROUND` (which points at `BRAND_530`) turns
 * brand.
 */

export type Intent = 'pass' | 'neutral' | 'brand' | 'critical'

/**
 * Families Discord keeps outside the Material palette. Checked first because
 * a name can hold both, and a status colour must stay itself.
 */
const PASS_WORDS = [
	'STATUS',
	'FEEDBACK',
	'VOICE',
	'STREAMING',
	'PREMIUM',
	'BOOST',
	'NITRO',
	'POSITIVE',
	'SUCCESS',
	'WARNING',
	'INFO',
	'GRADIENT',
	'DND',
	'IDLE',
	'ONLINE',
	'OFFLINE',
	'SCRIM',
	'BACKDROP',
	'LIGHTBOX',
	'OVERLAY',
	'GREEN',
	// Vivid families Discord references by hue name (YELLOW_300 on the
	// mention background, BLUE_345 on the focus ring): flattening these to
	// the neutral ramp is what turns them grey, so they keep their colour.
	'YELLOW',
	'BLUE',
	'TEAL',
	'AQUA',
	'PINK',
	'PURPLE',
	'ORANGE',
	'GOLD',
]

const BRAND_WORDS = ['BRAND', 'BLURPLE']
const CRITICAL_WORDS = ['CRITICAL', 'DANGER', 'ERROR', 'DESTRUCTIVE', 'RED']

export function intentOf(name: string): Intent {
	const segments = name.split('_')
	for (const word of PASS_WORDS) {
		if (segments.includes(word)) return 'pass'
	}
	for (const word of BRAND_WORDS) {
		if (segments.includes(word)) return 'brand'
	}
	for (const word of CRITICAL_WORDS) {
		if (segments.includes(word)) return 'critical'
	}
	return 'neutral'
}
