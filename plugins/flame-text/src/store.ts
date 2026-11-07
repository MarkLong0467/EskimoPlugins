import { createStore } from '../../../shared/palmdevs/storage'
import type {
	FireBackground,
	FireHeight,
	FireMotion,
	FireSize,
	FireStyle,
} from './render/fire'

/** Where the flame button goes in the chat box. */
export type ButtonSpot = 'send' | 'actions' | 'both'

/** Everything the plugin saves. */
export interface Settings {
	/** Whether the messages you send become flaming GIFs. */
	on: boolean
	/** Whether `/flame` is in the `/` menu. */
	command: boolean
	/** Whether the flame button is in the chat box. */
	button: boolean
	/** Where the button goes. */
	buttonSpot: ButtonSpot
	/** What the flames look like. */
	style: FireStyle
	size: FireSize
	height: FireHeight
	background: FireBackground
	/** How many pictures the flames move through. */
	motion: FireMotion
	glow: boolean
	/** Also send the words as text with the GIF. */
	caption: boolean
	/** Longer messages are sent as normal text. */
	maxLength: number
	/** What the preview in the settings shows. */
	previewText: string
}

/** What a new install starts with. */
export const DEFAULT_SETTINGS: Settings = {
	on: false,
	command: true,
	button: true,
	buttonSpot: 'send',
	style: 'fire',
	size: 'medium',
	height: 'medium',
	background: 'dark',
	motion: 'normal',
	glow: true,
	caption: false,
	maxLength: 60,
	previewText: 'Flame',
}

/** The plugin's settings. */
export const store = createStore<Settings>(DEFAULT_SETTINGS)

/** A setting. */
export const setting = <K extends keyof Settings>(key: K): Settings[K] =>
	store.get(key)

/** The longest message that can be turned into a GIF. */
export const LENGTHS = [20, 40, 60, 100, 150]
