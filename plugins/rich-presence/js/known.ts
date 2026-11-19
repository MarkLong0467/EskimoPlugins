import { newId } from './actions'
import { newProfile } from './profiles'
import type { Profile } from './types'

/** Discord's public list of the games and apps it can detect (about 25,000, roughly 13 MB). */
export const DETECTABLE_URL = 'https://discord.com/api/v10/applications/detectable'

/** One game or app from Discord's list: only what the picker needs. */
export interface KnownApp {
	id: string
	name: string
	aliases: string[]
	/** The hash of its icon, if it has one. */
	icon: string
	/** Its name and other names made searchable (see `normalize`), worked out once when the list is loaded. */
	keys: string[]
}

/** The most results shown at once. */
export const MAX_RESULTS = 40

let loading: Promise<KnownApp[]> | undefined

/**
 * Fetches Discord's list once and keeps a slim copy for as long as Discord stays open. A failed fetch is not kept, so the
 * next try fetches again.
 */
export function loadKnownApps(): Promise<KnownApp[]> {
	if (!loading) {
		loading = fetch(DETECTABLE_URL, { headers: { Accept: 'application/json' } })
			.then(res => {
				if (!res.ok) throw new Error(`Discord answered ${res.status}`)
				return res.json()
			})
			.then((data: unknown) => {
				if (!Array.isArray(data)) throw new Error('Discord sent something that is not a list')
				return slim(data)
			})
		loading.catch(() => {
			loading = undefined
		})
	}
	return loading
}

/** Forgets the fetched list (for the tests). */
export function forgetKnownApps() {
	loading = undefined
}

/** Keeps the id, name, other names and icon of each entry that has an id and a name. */
export function slim(data: unknown[]): KnownApp[] {
	const out: KnownApp[] = []
	for (const item of data) {
		if (!item || typeof item !== 'object') continue
		const e = item as Record<string, unknown>
		const id = typeof e.id === 'string' ? e.id : ''
		const name = typeof e.name === 'string' ? e.name.trim() : ''
		if (!/^\d{5,25}$/.test(id) || !name) continue
		const aliases = Array.isArray(e.aliases)
			? e.aliases.filter((a): a is string => typeof a === 'string' && !!a.trim())
			: []
		out.push({
			id,
			name,
			aliases,
			icon: typeof e.icon_hash === 'string' ? e.icon_hash : '',
			keys: [name, ...aliases].map(normalize),
		})
	}
	return out
}

/** Lower case, with anything that is not a letter or digit turned into one space. */
export function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim()
}

/** How well one name matches what was typed: lower is better, -1 is no match. */
function score(n: string, query: string, words: string[]): number {
	if (!n) return -1
	if (n === query) return 0
	if (n.startsWith(query)) return 1
	if (n.includes(` ${query}`)) return 2
	if (n.includes(query)) return 3
	// Every typed word appears somewhere ("cod warzone" finds "Call of Duty: Warzone" through its other names).
	const nameWords = n.split(' ')
	if (words.length > 1 && words.every(w => nameWords.some(x => x.startsWith(w)))) return 4
	return -1
}

/**
 * The entries that match what was typed, best first: the exact name, then names that start with it, then a word that
 * starts with it, then anywhere in the name; other names (aliases) count a little less. Ties go to the shorter name.
 */
export function searchKnown(apps: KnownApp[], typed: string, limit = MAX_RESULTS): KnownApp[] {
	const query = normalize(typed)
	if (!query) return []
	const words = query.split(' ')
	const hits: Array<{ app: KnownApp; s: number }> = []
	for (const app of apps) {
		const keys = app.keys ?? [app.name, ...app.aliases].map(normalize)
		let s = score(keys[0] as string, query, words)
		for (const alias of keys.slice(1)) {
			const a = score(alias, query, words)
			if (a >= 0 && (s < 0 || a + 0.5 < s)) s = a + 0.5
		}
		if (s >= 0) hits.push({ app, s })
	}
	hits.sort((a, b) => a.s - b.s || a.app.name.length - b.app.name.length || a.app.name.localeCompare(b.app.name))
	return hits.slice(0, limit).map(h => h.app)
}

/** The link to an entry's icon on Discord's CDN, or nothing if it has no icon. */
export function iconUrl(app: KnownApp, size = 512): string {
	return app.icon ? `https://cdn.discordapp.com/app-icons/${app.id}/${app.icon}.png?size=${size}` : ''
}

/**
 * A new presence for a game or app from the list, filled in as if typed by hand: its name (in the list and as the
 * activity), its Application ID, "Playing", and its icon as the large image.
 */
export function profileFromApp(app: KnownApp): Profile {
	return Object.assign(newProfile(newId(), app.name), {
		name: app.name,
		applicationId: app.id,
		type: 0,
		largeImage: iconUrl(app),
	})
}
