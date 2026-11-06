import { lookupPath } from './finders'

// Discord records this module under a `../` prefix, and the path lookup is an
// exact match, so the prefix is part of the key.
const CONSTANTS_PATH = '../discord_common/js/shared/Constants.tsx'

/** Discord's own text style sheet, as the app itself sees it. */
function textStyleSheet(): Record<string, any> | undefined {
	try {
		const sheet = (valenced.discord.design.Design as any)?.TextStyleSheet
		return sheet && typeof sheet === 'object' ? sheet : undefined
	} catch {
		return undefined
	}
}

/**
 * Every text variant the app's `Text` component is keyed by, in the design
 * system's own order. The plugin keeps no list of its own, so a variant Discord
 * adds — or one only this build has — shows up here by itself.
 */
export function listTextVariants(): string[] {
	return Object.keys(textStyleSheet() ?? {})
}

export interface VariantGroup {
	family: string
	label: string
	variants: string[]
}

/** Families the design system groups under, in the order a picker should show them. */
const GROUP_ORDER = ['text', 'heading', 'display', 'redesign', 'eyebrow']

const GROUP_LABEL: Record<string, string> = {
	text: 'Body text',
	heading: 'Heading',
	display: 'Display',
	redesign: 'Redesign',
	eyebrow: 'Eyebrow',
	experimental: 'Experimental',
}

/**
 * `text-sm/semibold` → `text`, `redesign/heading-18/bold` → `redesign`,
 * `eyebrow` → `eyebrow`. Everything past the first token is a size or weight,
 * which is not worth its own section.
 */
function familyOf(variant: string): string {
	const head = variant.split('/')[0]
	const dash = head.indexOf('-')
	return dash === -1 ? head : head.slice(0, dash)
}

function labelOf(family: string): string {
	const known = GROUP_LABEL[family]
	if (known !== undefined) return known
	return family.charAt(0).toUpperCase() + family.slice(1)
}

/**
 * `listTextVariants()` bucketed by family. Families the ranking does not know
 * keep their encounter order behind the ones it does.
 */
export function listTextVariantGroups(): VariantGroup[] {
	const families = new Map<string, string[]>()
	for (const variant of listTextVariants()) {
		const family = familyOf(variant)
		const bucket = families.get(family)
		if (bucket === undefined) families.set(family, [variant])
		else bucket.push(variant)
	}

	const known = [...families.keys()]
	const rank = (family: string): number => {
		const index = GROUP_ORDER.indexOf(family)
		return index === -1 ? GROUP_ORDER.length : index
	}
	// `Array#sort` is stable, so families of equal rank stay in encounter order.
	const ordered = known.sort((a, b) => rank(a) - rank(b))

	return ordered.map(family => ({
		family,
		label: labelOf(family),
		variants: families.get(family) ?? [],
	}))
}

/** `"ggsans-Bold, NotoSans-Bold"` → both names; a plain name passes through. */
function addFontStack(target: Set<string>, fonts: unknown): void {
	if (fonts === null || typeof fonts !== 'object') return
	for (const value of Object.values(fonts as Record<string, unknown>)) {
		if (typeof value !== 'string') continue
		for (const part of value.split(',')) {
			const name = part.trim()
			if (name.length > 0) target.add(name)
		}
	}
}

/**
 * The font families this build carries: Discord's own `Fonts` constant, which
 * mirrors `assets/fonts`, plus every family the design system resolves for its
 * own text. Sorted and deduplicated — nothing here is a list the plugin keeps.
 *
 * A family that does not resolve falls back to the system face, which is why
 * every row in the picker shows a sample in the family it applies.
 */
export function listFontFamilies(): string[] {
	const names = new Set<string>()
	try {
		addFontStack(names, lookupPath<any>(CONSTANTS_PATH)?.Fonts)
		for (const style of Object.values(textStyleSheet() ?? {})) {
			const family = (style as any)?.fontFamily
			if (typeof family === 'string' && family.length > 0) names.add(family)
		}
	} catch {
		// Whatever failed to resolve is left out.
	}
	return [...names].sort((a, b) => a.localeCompare(b))
}
