import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'

/** The parts of Discord's design tokens this file reads. Discord does not type them, so they are described here. */
interface TokenSet {
	default: {
		colors: Record<string, unknown>
		internal?: {
			resolveSemanticColor?(theme: unknown, color: unknown): string | undefined
		}
	}
}

/**
 * Turns one of Discord's theme colors into a plain color for the current theme (light, dark, amoled...).
 *
 * Discord's colors are "semantic": they have no value until a theme is applied. If the theme or the resolver cannot be
 * found, the semantic color is returned as it is, which Discord's own components understand.
 *
 * @param token The name of the color, for example `STATUS_WARNING`.
 * @returns The color, or nothing if there is no such color or anything went wrong.
 */
export function resolveColor(token: string): string | undefined {
	try {
		const tokens = Tokens as unknown as TokenSet
		const color = tokens.default.colors[token]
		if (!color) return undefined

		const themeStore = Stores.ThemeStore as unknown as
			| { theme?: unknown }
			| undefined
		const theme = themeStore?.theme
		const internal = tokens.default.internal
		if (
			internal &&
			typeof internal.resolveSemanticColor === 'function' &&
			theme
		) {
			const resolved = internal.resolveSemanticColor(theme, color)
			if (resolved) return resolved
		}
		return color as string
	} catch {
		return undefined
	}
}
