import type { HookState, MenuTarget } from './types'

/** What the plugin found in Discord, what it patched, and how many messages it let through. */
export const hooks: HookState = {
	notificationUtils: 'not found',
	patched: [],
	error: '',
	bypassed: 0,
	last: '',
}

/** How many banners of the plugin's own have been shown. */
export const banners = { shown: 0 }

/** The names of icons seen in sheets that had no Mute row, to help find the right one in the report. */
export const iconsSeen: string[] = []

/** What the open menu sheet is about, if known. */
export const menu: { target: MenuTarget | null } = { target: null }

/** Marks which copy of the plugin is running, so a copy that was replaced leaves menus alone. */
export const INSTANCE = {}

/** The global the running copy's marker is kept in. */
export const INSTANCE_KEY = '__bypassStatusInstance'
