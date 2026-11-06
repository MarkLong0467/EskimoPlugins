import { DEFAULT_SEED } from '../defaults'
import { getSettings } from './settings'

export interface WallpaperInfo {
	/** Where the seed actually came from. */
	source: 'wallpaper' | 'seed'
	/** Native side's extraction path, when the wallpaper was readable. */
	method?: string
	sdk?: number
	dynamic?: boolean
	primary?: string
	colors?: string[]
	/** Why the wallpaper was not used, for the settings row. */
	note?: string
}

function isNativeAvailable(): boolean {
	try {
		return typeof valenced?.modules?.native?.callNativeMethod === 'function'
	} catch {
		return false
	}
}

function asHex(value: any): string | undefined {
	return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
		? value.toLowerCase()
		: undefined
}

/**
 * Ask the Kotlin side for the wallpaper, falling back to the user's seed.
 *
 * The native module is missing on old builds, the wallpaper may be a live one,
 * and Android only exposes `WallpaperColors` from API 27 — all of which come
 * back as `null` and land on the seed.
 */
export async function readWallpaper(): Promise<WallpaperInfo> {
	const settings = getSettings()
	const fallback = (reason: string): WallpaperInfo => ({
		source: 'seed',
		primary: settings.seed || DEFAULT_SEED,
		note: reason,
	})

	if (!settings.wallpaper) return fallback('Wallpaper colours are off')

	if (!isNativeAvailable()) {
		return fallback('No native module in this build')
	}

	try {
		// The typed signature only lists bundle-owned method names, and this one
		// is declared by the plugin's own Kotlin side.
		const call = valenced.modules.native.callNativeMethod as any
		const result: any = await call('materialcord.wallpaper', [])
		const primary = asHex(result?.primary)
		if (primary != null) {
			return {
				source: 'wallpaper',
				method: typeof result.method === 'string' ? result.method : undefined,
				sdk: typeof result.sdk === 'number' ? result.sdk : undefined,
				dynamic: result.dynamic === true,
				primary,
				colors: Array.isArray(result.colors)
					? result.colors
							.filter((c: any) => asHex(c) != null)
							.map((c: any) => asHex(c) as string)
					: undefined,
			}
		}
		return fallback('Wallpaper could not be read')
	} catch {
		return fallback('Wallpaper could not be read')
	}
}
