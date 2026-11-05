import { saveSettings, setting } from './config'
import type { BypassList, ListKind } from './types'

/** Parses JSON text, giving `fallback` when it is not valid or is null. */
function parseJson<T>(text: string, fallback: T): T {
	try {
		return JSON.parse(text) ?? fallback
	} catch {
		return fallback
	}
}

/** The list of people, chats or channels, and servers that may bypass Do Not Disturb. */
export function readList(): BypassList {
	const saved = parseJson<Partial<Record<ListKind, unknown>>>(
		setting('listsJson'),
		{},
	)
	const ids = (value: unknown) =>
		Array.isArray(value)
			? value.filter((id): id is string => typeof id === 'string')
			: []
	return {
		users: ids(saved.users),
		channels: ids(saved.channels),
		guilds: ids(saved.guilds),
	}
}

/** Saves the list. */
export const writeList = (list: BypassList): void =>
	saveSettings({ listsJson: JSON.stringify(list) })

/** Puts one entry on the list or takes it off. */
export function setOnList(kind: ListKind, id: string, wanted: boolean): void {
	const list = readList()
	const without = list[kind].filter(existing => existing !== id)
	list[kind] = wanted ? [...without, id] : without
	writeList(list)
}

/** Whether an entry is on the list. */
export const isOnList = (kind: ListKind, id: string): boolean =>
	readList()[kind].includes(id)

/** How many entries are on the list in all. */
export function listSize(): number {
	const list = readList()
	return list.users.length + list.channels.length + list.guilds.length
}

/** Every Discord ID in a pasted text (IDs are 15 to 20 digits). People can paste them with commas, spaces or lines. */
export const idsInText = (text: unknown): string[] => [
	...new Set(String(text || '').match(/\d{15,20}/g) || []),
]

/**
 * Adds the people in a pasted text to the list.
 *
 * @returns How many were new.
 */
export function addPeopleFromText(text: unknown): number {
	const list = readList()
	const fresh = idsInText(text).filter(id => !list.users.includes(id))
	if (fresh.length) writeList({ ...list, users: [...list.users, ...fresh] })
	return fresh.length
}
