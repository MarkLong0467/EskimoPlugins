/** Changing the list of silenced people, and saying so. */

import { openToast } from '../../../shared/kmmiio/toast'
import { diag } from './diag'
import { parseIds } from './filter'
import { personOf } from './people'
import { MAX_USERS, setting, store } from './store'

const TOAST_KEY = 'MARKLONG_SILENCE_USERS'

/** Whether a person is silenced. */
export const isSilenced = (id: string): boolean => setting('users').includes(id)

/** What adding people did. */
export interface AddResult {
	added: string[]
	already: string[]
	invalid: string[]
	/** The list was full, so these were not added. */
	full: string[]
}

/**
 * Silences the people in some text: ids, `<@id>` mentions, separated by commas, spaces or lines.
 *
 * @param quiet Do not show a toast (the settings screen shows the result itself).
 */
export function addPeople(text: string, quiet = false): AddResult {
	const { valid, invalid } = parseIds(text)
	const current = setting('users')
	const result: AddResult = { added: [], already: [], invalid, full: [] }
	const next = [...current]
	for (const id of valid) {
		if (next.includes(id)) result.already.push(id)
		else if (next.length >= MAX_USERS) result.full.push(id)
		else {
			next.push(id)
			result.added.push(id)
		}
	}
	if (result.added.length > 0) {
		store.set({ users: next })
		diag.log(
			'list',
			`silenced ${result.added.length} ${result.added.length === 1 ? 'person' : 'people'}`,
		)
		if (!quiet)
			openToast(
				TOAST_KEY,
				result.added.length === 1
					? `${personOf(result.added[0] as string).name} is silenced`
					: `${result.added.length} people silenced`,
			)
	}
	return result
}

/** Stops silencing a person. */
export function removePerson(id: string, quiet = false): void {
	const current = setting('users')
	if (!current.includes(id)) return
	store.set({ users: current.filter(entry => entry !== id) })
	diag.log('list', 'stopped silencing a person')
	if (!quiet) openToast(TOAST_KEY, `${personOf(id).name} is no longer silenced`)
}

/** Silences a person who is not silenced and lets one who is be heard again. Returns whether they are silenced now. */
export function toggleSilenced(id: string): boolean {
	if (isSilenced(id)) {
		removePerson(id)
		return false
	}
	addPeople(id)
	return isSilenced(id)
}
