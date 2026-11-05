import { LIST_PROPERTY } from './constants'
import type { ListHolder } from './types'

/** Defines the property again as a plain, writable one. Used when assigning to it directly does not work. */
function defineList(holder: ListHolder, value: unknown): void {
	Object.defineProperty(holder, LIST_PROPERTY, {
		value,
		configurable: true,
		enumerable: true,
		writable: true,
	})
}

/**
 * Puts a new list in place of Discord's own and returns a function that puts the old one back.
 *
 * Discord's constants may be frozen or defined as read-only. Assigning the list is tried first, and if the new value
 * did not stick, the property is defined again.
 *
 * @param holder The object that owns the list.
 * @param values The new list.
 * @returns A function that restores the original list.
 * @throws If neither way could replace the list.
 */
export function replaceValues(
	holder: ListHolder,
	values: number[],
): () => void {
	const original = holder[LIST_PROPERTY]

	try {
		holder[LIST_PROPERTY] = values
	} catch {
		// Frozen or read-only: handled below.
	}
	if (holder[LIST_PROPERTY] !== values) defineList(holder, values)
	if (holder[LIST_PROPERTY] !== values)
		throw new Error('Discord would not let the list be replaced')

	return () => {
		try {
			holder[LIST_PROPERTY] = original
		} catch {
			try {
				defineList(holder, original)
			} catch {
				// Nothing more can be done: the list stays as it is until Discord reloads.
			}
		}
	}
}
