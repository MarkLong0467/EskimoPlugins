export type MaterialMode = 'dark' | 'light'

export interface MaterialCordSettings {
	/** Swap Discord's semantic colours for the Material families. */
	enabled: boolean
	/** Seed the scheme from the device wallpaper when the native side can read it. */
	wallpaper: boolean
	/** `#rrggbb` fallback, used when the wallpaper is off or unreadable. */
	seed: string
}
