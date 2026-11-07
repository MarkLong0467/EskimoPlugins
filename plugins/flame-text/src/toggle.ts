import { openToast } from '../../../shared/kmmiio/toast'
import { diag } from './diag'
import { state } from './state'
import { setting, store } from './store'

const TOAST_KEY = 'MARKLONG_FLAME_TEXT_SWITCH'

/**
 * Turns flame text on or off, and says so.
 *
 * @param on The new state. When it is not given, the switch is flipped.
 * @param quiet Do not show a message (for the settings screen, which shows the change itself).
 * @returns The new state.
 */
export function switchFlame(on?: boolean, quiet = false): boolean {
	const next = on ?? !setting('on')
	store.set({ on: next })
	state.toggles++
	diag.log('switch', next ? 'Flame text on' : 'Flame text off')
	if (!quiet)
		openToast(
			TOAST_KEY,
			next
				? 'Flame text is on: your messages become burning GIFs'
				: 'Flame text is off',
		)
	return next
}
