import { captureId, copyIcon, copyText } from './clipboard'
import { roleColors } from './color'
import { SEEN_TTL_MS } from './constants'
import { lookupRole } from './roles'
import { state } from './state'
import { toast } from './toast'
import type { RoleOption } from './types'

/** The three things the plugin adds to the role menu, in the order they appear. */
export const OPTIONS: RoleOption[] = [
	{
		label: 'Copy Role Name',
		run(role) {
			copyText(role.name)
			toast(`Copied ${role.name}`)
		},
	},
	{
		label: 'Copy Role Color',
		run(role) {
			const colors = roleColors(role)
			if (!colors) return toast('That role has no color')
			copyText(colors)
			toast(`Copied ${colors}`)
		},
	},
	{ label: 'Copy Role Icon', run: copyIcon },
]

/** Whether a menu item is one of ours, so a menu is not given the options twice. */
export function isOurs(label: unknown): boolean {
	return OPTIONS.some(option => option.label === label)
}

/**
 * Runs one of the options.
 *
 * Which role the menu is about is learned by running Discord's own "Copy Role ID" action and keeping the id it copies.
 * If that gives nothing, the role last seen in a menu is used, as long as it was seen within the last minute.
 *
 * @param option The option that was tapped.
 * @param press The action of Discord's "Copy Role ID" item.
 */
export function runOption(option: RoleOption, press: () => unknown): void {
	let id = captureId(press)
	if (!id && Date.now() - state.seen.at < SEEN_TTL_MS)
		id = state.seen.roleId ?? undefined

	const role = lookupRole(id)
	if (!role) {
		toast('Could not find that role')
		return
	}

	Promise.resolve(option.run(role)).catch(error => {
		toast(
			`Could not copy: ${String((error as { message?: unknown } | undefined)?.message || error)}`,
		)
	})
}
