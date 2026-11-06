import {
	findFunctionByNameUsingStore,
	findModuleByPropsUsingStore,
} from './metro'
import type { ContextMenuItem } from './contextMenu'

export type { ContextMenuItem }

function guildMenuBuilder(): ((guildId: string) => any[]) | undefined {
	const found = findFunctionByNameUsingStore(
		'GuildStore',
		'getGuildsBarGuildMenuItems',
	)
	return typeof found === 'function' ? found : undefined
}

function folderMenuBuilder(): ((folderId: string) => any[]) | undefined {
	const mod = findModuleByPropsUsingStore(
		'SortedGuildStore',
		'getGuildFolderMenuItems',
	)
	const found = mod?.getGuildFolderMenuItems
	return typeof found === 'function' ? found : undefined
}

function toRows(raw: any): ContextMenuItem[] {
	if (!Array.isArray(raw)) return []
	// Rows are forwarded untouched. Discord's stock builders already set
	// `IconComponent` / `iconSource`, and this modal renders them itself.
	return raw.filter(row => row && typeof row.action === 'function')
}

export function buildGuildMenuItems(guildId: string): ContextMenuItem[] {
	const build = guildMenuBuilder()
	if (!build) return []
	return toRows(build(guildId))
}

export function buildFolderMenuItems(folder: any): ContextMenuItem[] {
	const build = folderMenuBuilder()
	if (!build) return []
	return toRows(build(folder?.id))
}
