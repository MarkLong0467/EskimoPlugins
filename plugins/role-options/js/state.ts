import type { Seen } from './types'

/**
 * The plugin's state. There is only one running copy of the plugin, so it is kept at module level.
 */
export const state: {
	/** When the options were last added to a menu (milliseconds). */
	addedAt: number
	/** The role the last menu or role chip was about. */
	seen: Seen
} = {
	addedAt: 0,
	seen: { roleId: null, guildId: null, at: 0 },
}
