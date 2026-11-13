/**
 * The colour of Discord's sheets. The background of a bottom sheet is one of Discord's colour tokens
 * (`MOBILE_ACTIONSHEET_BACKGROUND`), drawn in several layers of its own, so a style handed to the sheet is not enough to make
 * it see-through. The token is changed at the source instead: the function that turns a token into a colour gives the frosted,
 * see-through colour for this one token and passes every other token on to Discord unchanged. It is put back when the plugin
 * stops.
 */

import { store } from './config'
import { diag } from './diag'
import { look } from './look'
import { countOf } from './state'

type Cleanup = (...fns: Array<() => unknown>) => unknown

type Resolver = (theme: string, marker: unknown, context?: unknown) => unknown

interface TokenModule {
	colors?: Record<string, unknown>
	internal: {
		resolveSemanticColor: Resolver
		getSemanticColorName?: (marker: unknown) => unknown
	}
}

/** The tokens that become the sheet colour. */
const SHEET_TOKENS = new Set(['MOBILE_ACTIONSHEET_BACKGROUND'])

declare const valenced: {
	discord?: { common?: { tokens?: unknown } }
	modules?: { finders?: Record<string, any> }
}

function usable(candidate: unknown): TokenModule | undefined {
	const found = candidate as TokenModule | null | undefined
	return found != null &&
		typeof found.internal?.resolveSemanticColor === 'function'
		? found
		: undefined
}

/** Discord's token module, which may sit at any step of `namespace.default.Tokens.default`. */
function findTokens(): TokenModule | undefined {
	const pick = (candidate: any): TokenModule | undefined =>
		usable(candidate) ??
		usable(candidate?.default) ??
		usable(candidate?.Tokens) ??
		usable(candidate?.Tokens?.default)
	const fromApi = pick(valenced.discord?.common?.tokens)
	if (fromApi) return fromApi
	try {
		const { lookupModule, filters } = valenced.modules?.finders ?? {}
		const found = pick(
			lookupModule?.(filters.withProps('unsafe_rawColors', 'internal'), {
				initialize: true,
				cached: false,
			})?.[0],
		)
		if (found) return found
	} catch {}
	return undefined
}

/** Whether this is the table of colour definitions: name to `{category, [theme]: {raw, opacity}}`. */
function looksLikeDefinitions(table: any): boolean {
	return (
		table != null &&
		typeof table === 'object' &&
		typeof table.BACKGROUND_BASE_LOW === 'object' &&
		typeof table.BACKGROUND_BASE_LOW?.category === 'string'
	)
}

/** Discord's table of colour definitions, which its colour function reads on every call. */
function findDefinitions(): Record<string, any> | undefined {
	const api: any = valenced.discord?.common?.tokens
	for (const table of [api?.Tokens?.SemanticColor, api?.SemanticColor]) {
		if (looksLikeDefinitions(table)) return table
	}
	try {
		const { lookupModule, filters } = valenced.modules?.finders ?? {}
		const direct = lookupModule?.(filters.withProps('SemanticColor'), {
			initialize: true,
			cached: false,
		})?.[0]
		for (const table of [direct?.SemanticColor, direct]) {
			if (looksLikeDefinitions(table)) return table
		}
	} catch {}
	return undefined
}

/** The name of a token from its marker. */
function nameOf(tokens: TokenModule, marker: unknown): string | undefined {
	if (typeof marker === 'string') return marker
	if (marker == null || typeof marker !== 'object') return undefined
	try {
		const name = tokens.internal.getSemanticColorName?.(marker)
		if (typeof name === 'string') return name
	} catch {}
	const colors = tokens.colors ?? {}
	return Object.keys(colors).find(key => colors[key] === marker)
}

/** How opaque the sheet colour is at the user's strength. */
function sheetAlpha(): number {
	const colour = String(look('sheet').backgroundColor)
	return Number.parseFloat(colour.split(',')[3] ?? '1')
}

/**
 * Lowers the opacity of the sheet colour in Discord's own table. This is data that Discord's colour function reads each time, so
 * it works even where code keeps its own copy of that function. Returns what it changed, to put back.
 */
function lowerOpacity(): Array<() => void> {
	const table = findDefinitions()
	if (!table) return []
	const undo: Array<() => void> = []
	for (const name of SHEET_TOKENS) {
		const definition = table[name]
		if (definition == null || typeof definition !== 'object') continue
		for (const theme of Object.keys(definition)) {
			const entry = definition[theme]
			if (entry == null || typeof entry !== 'object' || !('raw' in entry))
				continue
			const before = Object.getOwnPropertyDescriptor(entry, 'opacity')
			const own = entry.opacity
			try {
				// A getter, so the switch and the strength apply at once and the sheet keeps Discord's own opacity when it is off.
				Object.defineProperty(entry, 'opacity', {
					configurable: true,
					enumerable: true,
					get: () => (store.get('sheets') ? sheetAlpha() : own),
				})
			} catch {
				continue
			}
			undo.push(() => {
				try {
					if (before) Object.defineProperty(entry, 'opacity', before)
					else Reflect.deleteProperty(entry, 'opacity')
				} catch {}
			})
		}
	}
	countOf('sheet table').seen = undo.length
	countOf('sheet table').frosted = undo.length
	return undo
}

/** Makes the sheet colour see-through, and puts Discord's own back when the plugin stops. */
export function installSheetColour(cleanup: Cleanup): void {
	// Both lines are in the report and the settings even when nothing is found, as 0 of 0.
	countOf('sheet table')
	countOf('sheet colour')
	const undo = lowerOpacity()
	cleanup(() => {
		for (const restore of undo) restore()
	})
	if (undo.length === 0)
		diag.log(
			'sheet colour',
			"Discord's table of colours was not found, so the opacity of sheets was not changed",
			'warn',
		)
	const tokens = findTokens()
	if (!tokens) {
		diag.log(
			'sheet colour',
			"Discord's colour function was not found, so sheets only get the style hook",
			'warn',
		)
		return
	}
	const original = tokens.internal.resolveSemanticColor
	const count = countOf('sheet colour')
	const names = new WeakMap<object, string>()
	const wrapper: Resolver = function (this: unknown, theme, marker, context) {
		const result = original.call(this, theme, marker, context)
		try {
			if (marker == null || typeof marker !== 'object' || !store.get('sheets'))
				return result
			let name = names.get(marker)
			if (name === undefined) {
				name = nameOf(tokens, marker) ?? ''
				names.set(marker, name)
			}
			if (!SHEET_TOKENS.has(name)) return result
			count.seen++
			count.frosted++
			return look('sheet').backgroundColor
		} catch {
			return result
		}
	}
	tokens.internal.resolveSemanticColor = wrapper
	if (tokens.internal.resolveSemanticColor !== wrapper) {
		diag.log(
			'sheet colour',
			'the colour function could not be replaced',
			'warn',
		)
		return
	}
	cleanup(() => {
		// Only unwind while this wrapper is still the one in place: another plugin may have wrapped it since.
		if (tokens.internal.resolveSemanticColor === wrapper)
			tokens.internal.resolveSemanticColor = original
	})
}
