/** How the app is laid out. */
export type Mode = 'rtl' | 'text' | 'mirror' | 'off'

/** The plugin's settings, stored as JSON. */
export interface RtlSettings {
	/** The style: right to left, right-aligned text only, mirror everything, or off. (An older version called `rtl` `align`.) */
	mode: Mode | 'align'
	/** In the mirrored app, turn letters and pictures back the right way round. */
	readable: boolean
	/** True once this plugin has asked the phone for right to left, so it knows to give the normal direction back. */
	forced: boolean
}

/** Whether each hook is in place, and what it has seen. Shown on the settings screen. */
export interface HookStatus {
	/** What the mirror is hooked into, in words. */
	how: string
	/** The apps Discord registered, that were wrapped. */
	keys: string[]
	/** Which hook flipped the app first. */
	fired: string
	/** An error from asking for the layout direction, if any. */
	direction: string
	/** Whether pictures were counter-flipped. */
	image: boolean
	/** Whether text boxes were counter-flipped. */
	input: boolean
	/** Whether the message rows are hooked. */
	rows: string
	/** How many message rows were seen and how many were changed. */
	seen: number
	changed: number
	/** The apps Discord registered, in words. */
	registry?: string
	/** Errors from steps that failed to hook, by step. */
	[step: string]: unknown
}

/** One row sent to Discord's native chat. */
export interface ChatRow {
	type?: number
	message?: { content?: unknown }
}

/** A piece of a message: text, a link, an emoji, a mention. */
export interface Inline {
	type?: string
	content?: unknown
	[field: string]: unknown
}

/** React Native's layout direction manager, as far as the plugin uses it. */
export interface I18nManager {
	isRTL?: boolean
	forceRTL(force: boolean): void
	allowRTL?(allow: boolean): void
	swapLeftAndRightInRTL?(swap: boolean): void
}

/** A native app that React Native can run. */
export interface Runnable {
	componentProvider?: () => unknown
	section?: boolean
}

/** React Native's registry of apps. */
export interface AppRegistryLike {
	getAppKeys?(): string[]
	getRunnable?(key: string): Runnable | undefined
	registerComponent?(
		key: string,
		provider: () => unknown,
		section?: boolean,
	): unknown
}
