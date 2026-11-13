import { createStore } from '../../../shared/palmdevs/storage'

/** A saved channel (a text channel, a voice channel's chat, a DM, a thread or a forum post). */
export interface Tab {
	/** The channel's id. */
	id: string
	/** The server it is in, or nothing for a DM. */
	guildId: string | null
	/** Its name when it was saved, used when Discord does not have the channel loaded. */
	name: string
}

/** Where the tabs are drawn. */
export type Position = 'top' | 'left'

/** How the two halves of a split screen are placed. */
export type Layout = 'stacked' | 'side'

/** What the plugin saves. */
export interface TabsSettings {
	/** The saved tabs, in order. */
	tabs: Tab[]
	/** Where the tab bar is. */
	position: Position
	/** Top and bottom, or side by side. */
	layout: Layout
	/** The channel in the second half of a split screen, or nothing when the screen is not split. */
	split: Tab | null
	/** Whether the bar is folded away, with only its handle left to pull it back out. */
	collapsed: boolean
	/**
	 * Whether the second half of a split draws the chat itself. Off, it only shows which channel is there, to tap and open
	 * it.
	 */
	splitChat: boolean
}

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: TabsSettings = {
	tabs: [],
	position: 'top',
	layout: 'stacked',
	split: null,
	collapsed: false,
	splitChat: true,
}

/** The plugin's settings. */
export const store = createStore<TabsSettings>(DEFAULT_SETTINGS)
