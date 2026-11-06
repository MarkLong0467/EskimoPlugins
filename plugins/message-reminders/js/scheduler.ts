import { AppState } from 'react-native'
import { CHECK_MS, FIRST_CHECK_MS } from './constants'
import { due } from './reminders'
import type { Reminder } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** What identifies one due time of a reminder. A snoozed reminder is a new one. */
function keyOf(reminder: Reminder): string {
	return `${reminder.id}@${reminder.at}`
}

/** The reminders that were announced during this session, so each is announced once. */
const announced = new Set<string>()

/** Forgets what was announced. Used when the plugin stops. */
export function forgetAnnounced(): void {
	announced.clear()
}

/**
 * Looks for reminders that are due, now and then, and calls `notify` with the ones not announced yet.
 *
 * Valenced plugins cannot run while Discord is closed, so the look happens every few seconds while it is open, once soon
 * after it starts (which catches reminders that came due while it was closed) and every time the app comes back to the
 * front. Reminders that are due stay in the list until they are dealt with.
 *
 * @param cleanup Where to register what stops the looking.
 * @param notify Called with the newly due reminders.
 * @returns A function that looks right now.
 */
export function startScheduler(
	cleanup: Cleanup,
	notify: (fresh: Reminder[]) => void,
): () => void {
	const look = () => {
		const fresh = due().filter(r => !announced.has(keyOf(r)))
		if (!fresh.length) return
		for (const r of fresh) announced.add(keyOf(r))
		notify(fresh)
	}
	const interval = setInterval(look, CHECK_MS)
	const first = setTimeout(look, FIRST_CHECK_MS)
	const subscription = AppState.addEventListener('change', state => {
		if (state === 'active') look()
	})
	cleanup(() => {
		clearInterval(interval)
		clearTimeout(first)
		subscription?.remove?.()
	})
	return look
}
