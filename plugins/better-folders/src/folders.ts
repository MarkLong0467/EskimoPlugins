/**
 * Discord's folders, as far as this plugin reads them.
 *
 * `UserSettingsProtoStore.getGuildFolders()` lists the folders of the server bar (an entry without a `folderId` is a server that
 * is not in a folder), and `ExpandedGuildFolderStore.isFolderExpanded(folderId)` says which are open.
 */

import { Stores } from '@valenced/discord/flux'

/** One entry of the server bar. */
export interface FolderEntry {
	/** The folder's id. Nothing for a server that is not in a folder. */
	folderId?: number | string
	folderName?: string
	guildIds?: string[]
	[field: string]: unknown
}

interface FolderStores {
	UserSettingsProtoStore?: { getGuildFolders?: () => FolderEntry[] }
	ExpandedGuildFolderStore?: {
		isFolderExpanded?: (id: number | string) => boolean
	}
}

const stores = (): FolderStores => Stores as unknown as FolderStores

/** The folders of the server bar. Empty when Discord's store cannot be reached. */
export function getFolders(): FolderEntry[] {
	try {
		const list = stores().UserSettingsProtoStore?.getGuildFolders?.()
		return Array.isArray(list)
			? list.filter(entry => entry?.folderId != null && entry.folderId !== 0)
			: []
	} catch {
		return []
	}
}

/** Whether a folder is open. */
export function isExpanded(folderId: number | string): boolean {
	try {
		return (
			stores().ExpandedGuildFolderStore?.isFolderExpanded?.(folderId) === true
		)
	} catch {
		return false
	}
}

/** Whether both of Discord's stores can be read. */
export function storesReachable(): boolean {
	const s = stores()
	return (
		typeof s.UserSettingsProtoStore?.getGuildFolders === 'function' &&
		typeof s.ExpandedGuildFolderStore?.isFolderExpanded === 'function'
	)
}
