import { ToastActionCreators } from '@valenced/discord/actions'
import { HYPESQUAD_PATH, TOAST_KEY } from './constants'
import { explain } from './explain'
import { houseName } from './house'
import { request } from './http'
import { currentHouse, isBusy, notify, setBusy, setOptimistic } from './state'
import type { RequestError } from './types'

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
function toast(text: string): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text })
	} catch {
		// Toasts are a convenience.
	}
}

/**
 * Joins a HypeSquad house, or leaves HypeSquad.
 *
 * Only one change runs at a time. On success the settings screen is updated at once, without waiting for Discord's
 * profile data to catch up. On failure a toast explains what went wrong.
 *
 * @param houseId 1, 2 or 3 to join that house, or 0 to leave.
 */
export async function change(houseId: number): Promise<void> {
	if (isBusy()) return toast('Still working on the last change.')
	if (currentHouse() === houseId) {
		return toast(
			houseId
				? `You are already in HypeSquad ${houseName(houseId)}.`
				: 'You are not in a HypeSquad house.',
		)
	}

	setBusy(true)
	toast(
		houseId
			? `Joining HypeSquad ${houseName(houseId)}...`
			: 'Leaving HypeSquad...',
	)
	try {
		if (houseId) await request('POST', HYPESQUAD_PATH, { house_id: houseId })
		else await request('DELETE', HYPESQUAD_PATH)
		setOptimistic(houseId)
		notify()
		toast(
			houseId
				? `You are now in HypeSquad ${houseName(houseId)}.`
				: 'You left HypeSquad.',
		)
	} catch (error) {
		toast(explain(error as RequestError))
	} finally {
		setBusy(false)
	}
}
