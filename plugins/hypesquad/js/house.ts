import { Stores } from '@valenced/discord/flux'
import { HOUSES } from './constants'
import type { UserStore } from './types'

/** Discord's user store, described locally because `Stores` is typed loosely (every store is `Store<object>`). */
export const userStore = () =>
	Stores.UserStore as unknown as UserStore | undefined

/**
 * The house you are in, read from your profile flags: 1, 2 or 3, or 0 for none.
 * `publicFlags` is preferred, and `flags` is used when it is missing.
 */
export function houseFromProfile(): number {
	const user = userStore()?.getCurrentUser?.()
	const flags =
		(user && (user.publicFlags != null ? user.publicFlags : user.flags)) || 0
	for (const house of HOUSES) {
		if (flags & house.flag) return house.id
	}
	return 0
}

/** The name of a house, or `none` for 0 and unknown ids. */
export function houseName(id: number): string {
	return HOUSES.find(house => house.id === id)?.name ?? 'none'
}
