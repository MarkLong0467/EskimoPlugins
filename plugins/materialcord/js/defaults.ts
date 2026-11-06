import type { MaterialCordSettings, MaterialMode } from './types'

export const DEFAULT_SEED = '#6750a4'

export const DEFAULTS: MaterialCordSettings = {
	enabled: true,
	wallpaper: true,
	seed: DEFAULT_SEED,
}

/** The two synthetic theme keys registered into Discord's `Theme` map. */
export const MATERIAL_DARK = 'materialcord-dark'
export const MATERIAL_LIGHT = 'materialcord-light'

/** Uppercase aliases — the resolver validates `theme.toUpperCase()`. */
export const ALIAS_DARK = 'MATERIALCORD-DARK'
export const ALIAS_LIGHT = 'MATERIALCORD-LIGHT'

/** True when the theme is one of this plugin's synthetic keys. */
export function isMaterialTheme(theme: unknown): boolean {
	return theme === MATERIAL_DARK || theme === MATERIAL_LIGHT
}

/** The stock theme our key was cloned from, for fallbacks and restoration. */
export function referenceFor(theme: string): 'light' | 'darker' {
	return theme === MATERIAL_LIGHT ? 'light' : 'darker'
}

/** The mode a theme key paints in — ours follow their own key, not lookup. */
export function modeForTheme(theme: string): MaterialMode {
	return theme === MATERIAL_LIGHT ? 'light' : 'dark'
}
