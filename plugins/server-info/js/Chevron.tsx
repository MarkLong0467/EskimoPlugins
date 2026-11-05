import { Design } from '@valenced/discord/design'
import { CHEVRON_ICON } from './constants'
import { asset } from './discord'

/**
 * The arrow at the end of a row that opens something, or nothing if Discord has no such icon.
 * It is a function, not a component, because a row takes the arrow as a value for its `trailing` prop.
 */
export function chevron() {
	const id = asset(CHEVRON_ICON)
	return id != null ? <Design.TableRow.Icon source={id} /> : undefined
}
