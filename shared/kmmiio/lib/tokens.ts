type CompactTokens = {
	colors: Record<string, any>
	unsafe_rawColors: Record<string, string>
	internal: {
		resolveSemanticColor: (
			theme: string,
			semObj: any,
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
		return '#' + (result >>> 0).toString(16).padStart(8, '0').slice(2)
	}
	return undefined
}

export function resolveColor(semToken: string): string | undefined {
	try {
		const tokens = getTokens()
		if (!tokens) return undefined
		const semObj = tokens.colors?.[semToken]
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
