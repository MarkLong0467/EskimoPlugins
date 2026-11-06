import { resolveUser } from '../../lib/api'
import {
	getDesign,
	getUserStore,
	openUserProfileSheet,
} from '../../lib/modules'

export { getDesign }

import type { AltEntry } from '../../lib/api'

export const avatarStyle = { width: 32, height: 32, borderRadius: 16 }

let cachedRows: AltRow[] = []
let sheetCounter = 0

export interface AltRow {
	id: string
	name: string
	role: 'main' | 'alt'
	warning: string | null
	avatarUri: string
}

export interface LinkRow {
	entryId: number
	name: string
	warning: string | null
	avatarUri: string
}

export function getReact(): any {
	return (valenced as any).react?.React
}

export function getCachedRows(): AltRow[] {
	return cachedRows
}

export function setCachedRows(rows: AltRow[]): void {
	cachedRows = rows
}

export function defaultAvatarUri(id: string): string {
	let index = 0
	try {
		index = Number((BigInt(id) >> 22n) % 6n)
	} catch {}
	return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}

export function avatarUri(id: string, hash: string | null | undefined): string {
	if (hash && hash.length > 0) {
		const ext = hash.startsWith('a_') ? 'gif' : 'png'
		return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=80`
	}
	return defaultAvatarUri(id)
}

let rn: any
export function getRN(): any {
	if (rn) return rn
	try {
		rn = (valenced as any).react?.ReactNative
	} catch {}
	if (!rn) {
		try {
			rn = (valenced as any).reactNative
		} catch {}
	}
	return rn
}

let scrollContainerModule: any
export function getScrollContainer(): any {
	if (scrollContainerModule) return scrollContainerModule
	try {
		const [exports] =
			(valenced as any).modules?.finders?.lookupModule?.(
				(valenced as any).modules?.finders?.filters?.withProps?.(
					'BottomSheetScrollView',
				),
			) ?? []
		if (exports?.BottomSheetScrollView) {
			scrollContainerModule = exports.BottomSheetScrollView
		}
	} catch {}
	return scrollContainerModule
}

export async function resolveNameAndAvatar(id: string): Promise<{
	name: string
	avatarUri: string
}> {
	const cached = getUserStore()?.getUser?.(id)
	let name = cached?.displayName || cached?.globalName || cached?.username || ''
	let hash = typeof cached?.avatar === 'string' ? cached.avatar : null

	if (!name || hash == null) {
		const resolved = await resolveUser(id)
		if (!name && resolved) {
			name = resolved.displayName || resolved.username || ''
		}
		if (hash == null && resolved) hash = resolved.avatar ?? null
	}

	return { name: name || id, avatarUri: avatarUri(id, hash) }
}

export async function buildRows(
	targetId: string,
	entries: AltEntry[],
): Promise<AltRow[]> {
	const rows: AltRow[] = []
	const seen = new Set<string>()
	for (const entry of entries) {
		const isMain = entry.mainId === targetId
		const other = isMain ? entry.altId : entry.mainId
		if (!other || other === targetId || seen.has(other)) continue
		seen.add(other)

		const resolved = await resolveNameAndAvatar(other)
		rows.push({
			id: other,
			name: resolved.name,
			role: isMain ? 'alt' : 'main',
			warning: entry.warning,
			avatarUri: resolved.avatarUri,
		})
	}
	return rows
}

export async function buildLinkRows(entries: AltEntry[]): Promise<LinkRow[]> {
	const rows: LinkRow[] = []
	for (const entry of entries) {
		const resolved = await resolveNameAndAvatar(entry.altId)
		rows.push({
			entryId: entry.id,
			name: resolved.name,
			warning: entry.warning,
			avatarUri: resolved.avatarUri,
		})
	}
	return rows
}

export function hideSheet(key?: string): void {
	try {
		const creator = (valenced as any).discord?.actions
			?.ActionSheetActionCreators
		if (key) creator?.hideActionSheet?.(key)
		else creator?.hideActionSheet?.()
	} catch {}
}

export function openSheet(Component: any, runtimeProps: any): string | null {
	try {
		const creators = (valenced as any).discord?.actions
			?.ActionSheetActionCreators
		const design = getDesign()
		if (typeof creators?.openLazy !== 'function' || !design?.ActionSheet)
			return null
		sheetCounter += 1
		const key = `altmaster-sheet-${sheetCounter}`
		creators.openLazy(Promise.resolve({ default: Component }), key, {
			...runtimeProps,
			sheetKey: key,
		})
		return key
	} catch {
		return null
	}
}

export function openAccountProfile(userId: string): boolean {
	return openUserProfileSheet({ userId, ignoreBlockedSpeedBump: false })
}
