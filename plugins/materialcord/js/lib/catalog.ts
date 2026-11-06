/**
 * Discord's own semantic colour table, read at runtime.
 *
 * The table is the `SemanticColor` export of `tokens/native.tsx`: every token
 * carries a `category`, a per-theme `{raw, opacity}` pair, and the raw colour
 * it resolves to. Nothing here is a hand-written list: the engine reads
 * whatever Discord ships in the bundle it is running on.
 *
 * The raw colours are copied, not referenced — the register repaints
 * `unsafe_rawColors` behind getters, and the catalogue has to keep measuring
 * against Discord's originals.
 */

export interface RawDef {
	raw: string
	opacity: number
}

export interface TokenDef {
	name: string
	category: string
	themes: Record<string, RawDef>
}

const FALLBACK_THEMES = ['light', 'dark', 'midnight', 'darker']

let defs: Map<string, TokenDef> | undefined
let raws: Record<string, string> = {}
let keys: string[] = [...FALLBACK_THEMES]

export function buildCatalog(
	table: Record<string, any> | undefined,
	rawColors: Record<string, string> | undefined,
	themeValues: string[] | undefined,
): void {
	const valid = new Set(
		themeValues && themeValues.length > 0 ? themeValues : FALLBACK_THEMES,
	)
	const map = new Map<string, TokenDef>()
	for (const name of Object.keys(table ?? {})) {
		const entry = table?.[name]
		if (entry == null || typeof entry !== 'object') continue
		const themes: Record<string, RawDef> = {}
		for (const key of Object.keys(entry)) {
			if (!valid.has(key)) continue
			const value = entry[key]
			if (value == null || typeof value !== 'object') continue
			if (typeof value.raw !== 'string') continue
			themes[key] = {
				raw: value.raw,
				opacity: typeof value.opacity === 'number' ? value.opacity : 1,
			}
		}
		map.set(name, {
			name,
			category: typeof entry.category === 'string' ? entry.category : '',
			themes,
		})
	}
	defs = map
	raws = { ...rawColors }
	keys = [...valid]
}

export function tokenDef(name: string): TokenDef | undefined {
	return defs?.get(name)
}

export function catalogNames(): string[] {
	return defs ? [...defs.keys()] : []
}

export function themeKeys(): string[] {
	return keys
}

/** The definition for one theme, falling back to the closest sibling. */
export function defFor(def: TokenDef, themeKey: string): RawDef | undefined {
	const dark = def.themes.darker ?? def.themes.dark ?? def.themes.midnight
	return (
		def.themes[themeKey] ??
		(themeKey === 'light' ? (def.themes.light ?? def.themes.darker) : dark)
	)
}

export function rawHex(raw: string): string | undefined {
	return raws[raw]
}
