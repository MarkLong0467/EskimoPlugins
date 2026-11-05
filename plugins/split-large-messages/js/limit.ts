import { Stores } from '@valenced/discord/flux'
import type { UserStore } from './types'

/** Longest message a user without Nitro can send. */
export const DEFAULT_LIMIT = 2000

/** Longest message a user with Nitro or Nitro Classic can send. */
export const NITRO_LIMIT = 4000

/** `premiumType` values that raise the limit: 1 is Nitro Classic, 2 is Nitro. Nitro Basic (3) does not. */
const NITRO_TYPES = [1, 2]

/**
 * Returns the longest message the current user may send: 4000 characters with Nitro, 2000 otherwise.
 *
 * It is read on every send instead of once at start, so the limit follows the account if Nitro is gained or lost
 * while Discord is running.
 */
export function maxMessageLength(): number {
	// `Stores` is typed loosely (every store is `Store<object>`), so the one method used here is described locally.
	const users = Stores.UserStore as unknown as UserStore | undefined
	const type = users?.getCurrentUser?.()?.premiumType
	return type !== undefined && NITRO_TYPES.includes(type)
		? NITRO_LIMIT
		: DEFAULT_LIMIT
}
