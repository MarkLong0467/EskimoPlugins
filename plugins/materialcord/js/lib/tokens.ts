/**
 * Discord's token module, reached the way the bundle itself reaches it.
 *
 * `valenced.discord.common.tokens` is the tokens *namespace*
 * (`{Tokens, TokensModuleId}`), and `Tokens` is the namespace of
 * `tokens/native.tsx`, so the module proper is `Tokens.default`. Its
 * `colors` map only holds `{[Symbol('semanticColor')]: name}` markers —
 * the table of definitions (category, per-theme raw, opacity) is the separate
 * `SemanticColor` export, which is what the catalogue has to be read from.
 */

type CompactTokens = {
	/** `ThemeTypes` — `{DARK: 'dark', LIGHT: 'light', MIDNIGHT: 'midnight', DARKER: 'darker'}`. */
	themes?: Record<string, string>
	/** Name → semantic marker object; the definition table is `SemanticColor`. */
	colors: Record<string, any>
	/** `Shadow` — name → per-theme `{boxShadow, filter, nativeStyles}`. */
	Shadow?: Record<string, any>
	unsafe_rawColors: Record<string, string>
	internal: {
		resolveSemanticColor: (
			theme: string,
			semObj: any,
			ctx?: any,
		) => string | number | undefined
		getSemanticColorName?: (semObj: any) => string
		isSemanticColor?: (semObj: any) => boolean
	}
}

export type TokensSource = 'api' | 'finder' | 'none'

let tokenModule: CompactTokens | undefined | null
let source: TokensSource = 'none'
let definitions: Record<string, any> | undefined | null
let shadows: Record<string, any> | undefined | null
let dividers: Record<string, string> | undefined | null

function usable(candidate: any): CompactTokens | undefined {
	if (
		candidate != null &&
		typeof candidate.unsafe_rawColors === 'object' &&
		typeof candidate.internal?.resolveSemanticColor === 'function'
	) {
		return candidate as CompactTokens
	}
	return undefined
}

/** The module itself may sit at any step of `namespace.default.Tokens.default`. */
function pick(candidate: any): CompactTokens | undefined {
	if (candidate == null) return undefined
	return (
		usable(candidate) ??
		usable(candidate.default) ??
		usable(candidate.Tokens) ??
		usable(candidate.Tokens?.default)
	)
}

export function getTokens(): CompactTokens | undefined {
	if (tokenModule !== undefined) return tokenModule ?? undefined
	tokenModule = null

	const api = (valenced.discord as any)?.common?.tokens
	const fromApi = pick(api)
	if (fromApi) {
		source = 'api'
		tokenModule = fromApi
		return fromApi
	}

	// The namespace lookup runs at bundle init, so it comes back empty when
	// the token module had not loaded yet. Search again, and let the finder
	// initialise candidates it has never seen.
	try {
		const { lookupModule, filters } = valenced.modules.finders
		const filters_ = [
			filters.withProps('unsafe_rawColors', 'internal'),
			filters.withProps('RawColor'),
		]
		for (const filter of filters_) {
			const found = pick(
				lookupModule(filter, { initialize: true, cached: false })?.[0],
			)
			if (found) {
				source = 'finder'
				tokenModule = found
				return found
			}
		}
	} catch {}

	source = 'none'
	return undefined
}

export function tokensSource(): TokensSource {
	getTokens()
	return source
}

function looksLikeDefinitions(table: any): boolean {
	return (
		table != null &&
		typeof table === 'object' &&
		typeof table.BACKGROUND_BASE_LOW === 'object' &&
		typeof table.BACKGROUND_BASE_LOW?.category === 'string'
	)
}

/** The table behind `resolveSemanticColor`: name → `{category, [theme]: {raw, opacity}}`. */
export function getSemanticColors(): Record<string, any> | undefined {
	if (definitions !== undefined) return definitions ?? undefined
	definitions = null

	const api: any = (valenced.discord as any)?.common?.tokens
	for (const table of [api?.Tokens?.SemanticColor, api?.SemanticColor]) {
		if (looksLikeDefinitions(table)) {
			definitions = table
			return table
		}
	}

	try {
		const { lookupModule, lookupModules, filters } = valenced.modules.finders
		const direct = lookupModule(filters.withProps('SemanticColor'), {
			initialize: true,
			cached: false,
		})?.[0]
		for (const table of [direct?.SemanticColor, direct]) {
			if (looksLikeDefinitions(table)) {
				definitions = table
				return table
			}
		}
		for (const [mod] of lookupModules(filters.withProps('_private'))) {
			const table = mod?._private?.SemanticColors
			if (looksLikeDefinitions(table)) {
				definitions = table
				return table
			}
		}
	} catch {}

	return undefined
}

function looksLikeShadows(table: any): boolean {
	if (table == null || typeof table !== 'object') return false
	const first = table.SHADOW_1 ?? table.SHADOW_2 ?? Object.values(table)[0]
	return first != null && typeof first === 'object' && 'dark' in first
}

/** The shadow table: name → per-theme `{boxShadow, filter, nativeStyles}`. */
export function getShadows(): Record<string, any> | undefined {
	if (shadows !== undefined) return shadows ?? undefined
	shadows = null

	const tokens = getTokens()
	const api: any = (valenced.discord as any)?.common?.tokens
	const candidates = [(tokens as any)?.Shadow, api?.Tokens?.Shadow, api?.Shadow]
	for (const table of candidates) {
		if (looksLikeShadows(table)) {
			shadows = table
			return table
		}
	}

	try {
		const { lookupModule, filters } = valenced.modules.finders
		const direct = lookupModule(filters.withProps('Shadow'), {
			initialize: true,
			cached: false,
		})?.[0]
		for (const table of [direct?.Shadow, direct]) {
			if (looksLikeShadows(table)) {
				shadows = table
				return table
			}
		}
	} catch {}

	return undefined
}

function looksLikeDividers(table: any): boolean {
	return (
		table != null &&
		typeof table === 'object' &&
		typeof table.dark === 'string' &&
		typeof table.light === 'string'
	)
}

/** `FormDivider.DIVIDER_COLORS`: theme value → divider hex. */
export function getDividerColors(): Record<string, string> | undefined {
	if (dividers !== undefined) return dividers ?? undefined
	dividers = null

	try {
		const { lookupModule, filters } = valenced.modules.finders
		const found = lookupModule(filters.withProps('DIVIDER_COLORS'), {
			initialize: true,
			cached: false,
		})?.[0]
		const table = found?.DIVIDER_COLORS
		if (looksLikeDividers(table)) {
			dividers = table
			return table
		}
	} catch {}

	return undefined
}

/** The `Theme`/`ThemeTypes` map: uppercase name → theme value. */
export function getThemes(): Record<string, string> | undefined {
	const themes = getTokens()?.themes
	return typeof themes === 'object' && themes != null ? themes : undefined
}

/** Resolve one semantic token to a hex string through the live resolver. */
export function resolveTokenHex(name: string): string | undefined {
	const tokens = getTokens()
	if (!tokens) return undefined
	const marker = tokens.colors?.[name]
	if (marker == null) return undefined
	try {
		const hex = tokens.internal.resolveSemanticColor(
			getTheme(),
			marker,
			undefined,
		)
		return typeof hex === 'string' && hex.startsWith('#') ? hex : undefined
	} catch {
		return undefined
	}
}

export function getTheme(): string {
	try {
		const theme = (valenced.discord.flux.Stores as any).ThemeStore?.theme
		if (typeof theme === 'string' && theme.length > 0) return theme
	} catch {}
	return 'dark'
}

/** True for Discord's light themes and for `materialcord-light`. */
export function isLightTheme(): boolean {
	const theme = getTheme()
	return (
		theme === 'light' || theme === 'lighter' || theme === 'materialcord-light'
	)
}
