import { IDENTITY_PROPS, MENU_ICONS, MENU_LABEL, SHEET_KEY } from './constants'
import { asset, sheets } from './discord'
import ServerInfoSheet from './ServerInfoSheet'
import type { MenuItem } from './types'

/** Opens the Server Info sheet for a server. */
export function openServerInfo(guildId: string): void {
	sheets().openLazy(
		Promise.resolve({ default: () => <ServerInfoSheet guildId={guildId} /> }),
		SHEET_KEY,
		{},
	)
}

/**
 * Adds Server Info to the list of items in the menu you get when you hold down a server icon.
 *
 * The new item is a copy of the first item that has a label, so it looks like the others, with the label, action and
 * icon replaced. Menus that are not a list, have no server, or already have the item are returned as they are.
 *
 * @param items What Discord's code for the server menu returned.
 * @param guildId The server the menu is for.
 * @returns The items, with Server Info at the end.
 */
export function withServerInfo<T>(items: T, guildId: unknown): T {
	if (!Array.isArray(items) || guildId == null) return items
	const list = items as MenuItem[]
	if (list.some(item => item && item.label === MENU_LABEL)) return items

	const template =
		list.find(item => item && typeof item.label === 'string') || {}
	const item: MenuItem = {
		...template,
		label: MENU_LABEL,
		action: () => openServerInfo(String(guildId)),
	}
	for (const name of IDENTITY_PROPS) delete item[name]

	const icon = MENU_ICONS.map(asset).find(id => id != null)
	if (icon != null) item.iconSource = icon
	else delete item.iconSource
	delete item.IconComponent

	return list.concat(item) as unknown as T
}
