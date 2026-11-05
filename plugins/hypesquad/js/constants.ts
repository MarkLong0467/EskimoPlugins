import type { House } from './types'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_HYPESQUAD'

/**
 * The three houses. `id` is the `house_id` Discord's API uses. `flag` is the bit in your profile flags that says
 * which house you are in.
 */
export const HOUSES: readonly House[] = [
	{ id: 1, name: 'Bravery', flag: 64 },
	{ id: 2, name: 'Brilliance', flag: 128 },
	{ id: 3, name: 'Balance', flag: 256 },
]

/** How long a request may take before it is given up, in milliseconds. */
export const TIMEOUT_MS = 15000

/** The API path for joining and leaving a house. */
export const HYPESQUAD_PATH = '/hypesquad/online'
