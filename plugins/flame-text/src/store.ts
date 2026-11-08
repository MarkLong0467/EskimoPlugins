import { createStore } from '../../../shared/palmdevs/storage'
import type {
	FireBackground,
	FireHeight,
	FireLook,
	FireMotion,
	FireSize,
	FireStyle,
} from './render/fire'

/** Everything the plugin saves. */
export interface Settings {
	/** Whether the messages you send become flaming GIFs. */
	on: boolean
	/** Whether `/flame` is in the `/` menu. */
	command: boolean
	/** Whether holding the + button of the chat box opens the Flame Typing menu. */
	button: boolean
	/** Whether a flame button sits left of the emoji button in the chat box. */
	chatButton: boolean
	/** What the flames look like. */
	style: FireStyle
	/** The shape of the letters and flames. */
	look: FireLook
	/** Whether the newer defaults (small, see-through) have been put in place. */
	defaultsSeen: boolean
	/** Whether /flame has been moved to off, once. */
	commandOffSeen: boolean
	size: FireSize
	height: FireHeight
	background: FireBackground
	/** How many pictures the flames move through. */
	motion: FireMotion
	glow: boolean
	/** Also send the words as text with the GIF. */
	caption: boolean
	/** What the preview in the settings shows. */
	previewText: string
}

/** What a new install starts with. */
export const DEFAULT_SETTINGS: Settings = {
	on: false,
	command: false,
	button: true,
	chatButton: false,
	style: 'fire',
	look: 'wild',
	defaultsSeen: true,
	commandOffSeen: true,
	size: 'small',
	height: 'medium',
	background: 'transparent',
	motion: 'normal',
	glow: true,
	caption: false,
	previewText: 'Flame',
}

/** The plugin's settings. */
export const store = createStore<Settings>(DEFAULT_SETTINGS)

/** A setting. */
export const setting = <K extends keyof Settings>(key: K): Settings[K] =>
	store.get(key)
