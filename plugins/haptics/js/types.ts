/** The plugin's settings, stored as JSON. Each switch is on by default: Discord buzzes as usual until one is turned off. */
export interface HapticsSettings {
	/** The buzz when a long-press menu opens. */
	menus: boolean
	/** Other haptic feedback from Discord's code: taps, switches and small buzzes. */
	discord: boolean
	/** Plain vibrations an app asks for. */
	vibration: boolean
}

/** A buzz that went by, with what was done about it. */
export interface HeardBuzz {
	/** What buzzed, for example `haptics.impactAsync(medium)`. */
	label: string
	/** What the plugin did: `buzz kept`, `buzz removed`, `allowed` or `swallowed`. */
	note: string
	/** How many times it has been seen. */
	count: number
	/** When it was last written to the log (milliseconds), so repeats are not logged more than every 5 seconds. */
	at?: number
}

/** Whether each kind of hook is in place, in words, shown on the settings screen. */
export interface HookStatus {
	menus: string
	libraries: string
	vibration: string
}

/** Registers a function to run when the plugin stops. */
export type Cleanup = (...fns: Array<() => unknown>) => unknown

/** Something that has a haptic function on it, such as a library or a native module. */
export type Holder = Record<string, unknown>
