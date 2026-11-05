import { houseFromProfile } from './house'

/**
 * The plugin's state. There is only one running copy of the plugin, so it is kept at module level.
 */

/**
 * The house you just switched to, until Discord's profile data catches up. Discord updates your flags a little after
 * the request succeeds, and the settings screen should show the change straight away.
 * `undefined` means there is no pending change.
 */
let optimistic: number | undefined

/** True while a change is in flight. Only one change runs at a time. */
let busy = false

/** Redraw callbacks of the settings screens that are showing. */
let listeners: Array<() => void> = []

export const isBusy = () => busy
export const setBusy = (value: boolean) => {
	busy = value
}

/** Remembers a house as the current one until Discord's own data agrees. */
export function setOptimistic(house: number | undefined): void {
	optimistic = house
}

/**
 * The house you are in: 1, 2 or 3, or 0 for none.
 * The pending change is used until your profile shows the same house, and is then dropped.
 */
export function currentHouse(): number {
	const real = houseFromProfile()
	if (optimistic !== undefined && real === optimistic) optimistic = undefined
	return optimistic !== undefined ? optimistic : real
}

/** Asks every settings screen that is showing to draw itself again. */
export function notify(): void {
	for (const listener of listeners) listener()
}

/** Registers a redraw callback. Returns a function that removes it. */
export function subscribe(listener: () => void): () => void {
	listeners.push(listener)
	return () => {
		listeners = listeners.filter(other => other !== listener)
	}
}

/** Forgets the pending change and the busy flag. Called when the plugin stops. */
export function resetState(): void {
	optimistic = undefined
	busy = false
}
