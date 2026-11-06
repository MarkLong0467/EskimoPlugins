type CompactTokens = {
	colors: Record<string, any>
	unsafe_rawColors: Record<string, string>
	shadows?: Record<string, any>
	internal: {
		resolveSemanticColor: (
			theme: string,
			semObj: any,
			ctx?: any,
		) => string | number | undefined
	}
}

let tokenModule: CompactTokens | undefined

export function getTokens(): CompactTokens | undefined {
	if (tokenModule !== undefined) return tokenModule
	try {
		const { lookupModule } = valenced.modules.finders
		const { withProps } = valenced.modules.finders.filters
		const [exports] = lookupModule(
			withProps('colors', 'unsafe_rawColors', 'internal'),
			{ cached: false },
		)
		if (
			exports != null &&
			typeof exports.colors === 'object' &&
			exports.colors !== null &&
			typeof exports.unsafe_rawColors === 'object' &&
			exports.unsafe_rawColors !== null &&
			typeof exports.internal?.resolveSemanticColor === 'function'
		) {
			tokenModule = exports
		}
	} catch {}
	return tokenModule
}

export function getTheme(): string {
	try {
		const theme = (valenced.discord.flux.Stores as any).ThemeStore?.theme
		if (typeof theme === 'string' && theme.length > 0) return theme
	} catch {}
	return 'dark'
}

function toHex(result: any): string | undefined {
	if (typeof result === 'string' && result.startsWith('#')) return result
	if (typeof result === 'number') {
		return `#${(result >>> 0).toString(16).padStart(8, '0').slice(2)}`
	}
	return undefined
}

/**
 * Resolve a colour to `#rrggbb`.
 *
 * Takes a `#hex` as-is, otherwise looks the name up in `tokens.colors` the way
 * the lib plugin does. Discord spells the same token in caps and underscores and
 * in lowercase with dashes (`MOBILE_TOAST_BACKGROUND_DEFAULT`,
 * `mobile-text-heading-primary`), so a name that is not a key verbatim is
 * uppercased and underscored first — the same colour either way.
 */
export function resolveColor(semToken?: string): string | undefined {
	if (!semToken) return undefined
	if (semToken.startsWith('#')) return semToken
	try {
		const tokens = getTokens()
		if (!tokens) return undefined
		const colors = tokens.colors
		const semObj = colors?.[semToken]
			? colors[semToken]
			: colors?.[semToken.replaceAll('-', '_').toUpperCase()]
		if (!semObj) return undefined
		const resolve = tokens.internal.resolveSemanticColor
		const theme = getTheme()
		const direct = toHex(resolve(theme, semObj))
		if (direct !== undefined) return direct
		if (theme !== 'dark') {
			const againstDark = toHex(resolve('dark', semObj))
			if (againstDark !== undefined) return againstDark
		}
	} catch {}
	return undefined
}

export function rawColor(name: string): string | undefined {
	try {
		const raw = getTokens()?.unsafe_rawColors?.[name]
		if (typeof raw === 'string' && raw.startsWith('#')) return raw
	} catch {}
	return undefined
}

const SHADOW_KEYS = [
	'shadowOffset',
	'shadowColor',
	'shadowOpacity',
	'shadowRadius',
	'elevation',
] as const

/**
 * `shadows.SHADOW_HIGH`, resolved for the current theme and platform.
 *
 * The tokens package wraps every field in its own `{ resolve(ctx) }`, so each one is
 * resolved individually rather than the bag as a whole.
 */
export function resolveShadowStyles(): Record<string, any> | undefined {
	try {
		const shadow = getTokens()?.shadows?.SHADOW_HIGH
		if (shadow == null) return undefined
		const ctx = {
			theme: getTheme(),
			isAndroid: valenced.react.ReactNative.Platform.OS === 'android',
		}
		const out: Record<string, any> = {}
		for (const key of SHADOW_KEYS) {
			const slot = shadow[key]
			if (slot == null) continue
			out[key] = typeof slot?.resolve === 'function' ? slot.resolve(ctx) : slot
		}
		return out
	} catch {
		return undefined
	}
}
