/**
 * What a frosted surface looks like. One function makes every look, so buttons, cards, fields and sheets belong together.
 *
 * Glass is a see-through fill, a hairline edge, and light catching the top edge. The fill is faint on controls and fields, a
 * little more on cards, and strongest on sheets, which are big and have text on them. The colours follow Discord's theme (dark
 * or light), and the tint and strength are the user's.
 */

import { Stores } from '@valenced/discord/flux'
import { store } from './config'
import type { Strength, Tint } from './config'

/** The kinds of surface. */
export type Kind = 'control' | 'rim' | 'card' | 'field' | 'sheet' | 'menu'

/** The colour of the frost on a dark theme, as `r,g,b`. */
const GLOW: Record<Tint, string> = {
	white: '255,255,255',
	blue: '130,165,255',
	violet: '175,140,255',
	rose: '255,140,185',
	mint: '120,230,195',
}

/** The colour of a sheet on a dark theme: the tint, but dark, so the text on it can be read. */
const SHEET_DARK: Record<Tint, string> = {
	white: '28,29,36',
	blue: '22,30,54',
	violet: '34,24,56',
	rose: '52,24,38',
	mint: '18,44,38',
}

/** The warmer light on the lower edge of a glass button, as `r,g,b`. */
const WARM = '255,175,150'

/** How much of each strength is used. */
const SCALE: Record<Strength, number> = { clear: 0.5, regular: 1, strong: 1.6 }

/** How opaque each kind of surface is at the regular strength, on a dark theme. */
const FILL: Record<'control' | 'card' | 'field', number> = {
	control: 0.16,
	card: 0.05,
	field: 0.07,
}

/** Whether Discord is on a light theme. Falls back to dark, which is what most people use. */
export function lightTheme(): boolean {
	try {
		const theme = (Stores as unknown as { ThemeStore?: { theme?: unknown } })
			.ThemeStore?.theme
		return theme === 'light'
	} catch {
		return false
	}
}

/** `rgba(...)` with the alpha kept to what is visible and not solid. */
const rgba = (rgb: string, alpha: number): string =>
	`rgba(${rgb},${Math.max(0, Math.min(0.95, +alpha.toFixed(3)))})`

/** The style of a frosted surface of this kind, with the user's tint and strength. */
export function look(kind: Kind): Record<string, unknown> {
	const tint = store.get('tint')
	const scale = SCALE[store.get('strength')]
	const light = lightTheme()
	if (kind === 'rim') {
		// Glass catches light on the top edge and a warmer one on the bottom, with a faint line between. Buttons keep their own
		// fill and shape and animate their own `borderColor`, but an edge's own colour wins over it, so the rim is set per edge.
		return {
			borderWidth: 1,
			borderTopColor: light
				? rgba('255,255,255', 0.9)
				: rgba(GLOW[tint], 0.3 + 0.25 * scale),
			borderBottomColor: light
				? rgba('0,0,0', 0.1)
				: rgba(WARM, 0.18 + 0.2 * scale),
			borderLeftColor: light
				? rgba('0,0,0', 0.06)
				: rgba(GLOW[tint], 0.08 + 0.08 * scale),
			borderRightColor: light
				? rgba('0,0,0', 0.06)
				: rgba(GLOW[tint], 0.08 + 0.08 * scale),
		}
	}
	if (kind === 'sheet' || kind === 'menu') {
		const alpha = 0.5 + 0.15 * scale
		const fill = {
			backgroundColor: light
				? rgba('248,249,252', alpha)
				: rgba(SHEET_DARK[tint], alpha),
		}
		if (kind === 'sheet') return fill
		// A menu is a floating surface with its own corners, so it can have the whole edge.
		return {
			...fill,
			borderWidth: 1,
			borderColor: light
				? rgba('0,0,0', 0.08)
				: rgba(GLOW[tint], 0.12 + 0.12 * scale),
			borderTopColor: light
				? rgba('255,255,255', 0.9)
				: rgba(GLOW[tint], 0.3 + 0.25 * scale),
		}
	}
	const fill = FILL[kind] * scale
	if (light) {
		return {
			backgroundColor: rgba('255,255,255', fill + 0.35),
			borderWidth: 1,
			borderColor: rgba('0,0,0', 0.08),
			borderTopColor: rgba('255,255,255', 0.9),
		}
	}
	const edge = rgba(GLOW[tint], 0.12 + 0.12 * scale)
	return {
		// A card is white glass whatever the colour, so rows are not tinted blocks: the colour is only in its edge.
		backgroundColor: rgba(kind === 'card' ? GLOW.white : GLOW[tint], fill),
		borderWidth: 1,
		borderColor: edge,
		// Rows of a card sit on top of each other, so a card has an even edge and only fields get the brighter top.
		borderTopColor: kind === 'card' ? edge : rgba(GLOW[tint], 0.22 + 0.2 * scale),
	}
}
