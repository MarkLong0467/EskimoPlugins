import { createStore } from '../../../shared/palmdevs/storage'

/** The tints the frost can have. */
export type Tint = 'white' | 'blue' | 'violet' | 'rose' | 'mint'

/** How strong the frost is. */
export type Strength = 'clear' | 'regular' | 'strong'

/** What the plugin saves. */
export interface GlassSettings {
	/** A glass rim on the profile bar at the bottom of the channel list. */
	bar: boolean
	/** Frost on Discord's secondary buttons and icon buttons (Search, Show All, the round buttons). */
	buttons: boolean
	/** Frost on cards. */
	cards: boolean
	/** Frost on text fields (search boxes, inputs). */
	fields: boolean
	/** A see-through background on bottom sheets (menus, pickers, plugin sheets). */
	sheets: boolean
	/** How strong the frost is. */
	strength: Strength
	/** The colour of the frost. */
	tint: Tint
}

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: GlassSettings = {
	bar: true,
	buttons: true,
	cards: true,
	fields: true,
	sheets: true,
	strength: 'regular',
	tint: 'white',
}

/** The plugin's settings. */
export const store = createStore<GlassSettings>(DEFAULT_SETTINGS)
