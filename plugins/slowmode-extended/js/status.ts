import type { Status } from './types'

/**
 * The state shown on the settings screen. There is only one running copy of the plugin, so it is kept at module level.
 * The module finder callback in `index.ts` fills it in and `Settings.tsx` reads it.
 */
export const status: Status = {
	found: 'not found yet',
	applied: false,
	count: 0,
	error: '',
}
