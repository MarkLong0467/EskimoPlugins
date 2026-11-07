/**
 * Takes hidden apps out of what Discord's `/` menu draws.
 *
 * Discord's `ApplicationCommandQueryApi` module has the two hooks the `/` menu is made from:
 * - `useDiscovery(options)` is the full menu. It returns `sectionDescriptors` and `activeSections` (the apps, which are also the
 *   icons of the rail at the bottom), `commandsByActiveSection` (the lists of commands under each app's header) and
 *   `commands`.
 * - `useQuery(context, query, options)` is what you see after typing `/ping`. It returns `commands` and `sections`.
 *
 * Each hook is wrapped: Discord's own runs, then what it returned is filtered. The commands are not taken out of Discord's
 * stores, only out of these two lists, so a command that was already sent still opens its popout and nothing else in
 * Discord loses an app.
 */

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useSyncExternalStore } from 'react'
import { diag } from './diag'
import { state } from './state'
import { getRevision, hasHidden, isHidden, onRevision } from './store'

/** A hook, as it is called. */
type Hook = (...args: unknown[]) => unknown

/** The hooks, on the module that has them. */
interface QueryApi {
	useDiscovery: Hook
	useQuery: Hook
}

/** Something with named fields, which is how Discord's results are read here. */
type Bag = Record<string, unknown>

const isBag = (value: unknown): value is Bag =>
	value != null && typeof value === 'object'

/** The names of an object's fields, with the kind of each, for the report. */
function shape(value: unknown): string {
	if (!isBag(value)) return String(value)
	return Object.entries(value)
		.slice(0, 16)
		.map(
			([key, item]) =>
				`${key}:${Array.isArray(item) ? `array(${item.length})` : typeof item}`,
		)
		.join(', ')
}

/** The id of the server a hook was called for, or nothing in a DM. */
function guildOf(args: unknown[]): string | undefined {
	const first = args[0]
	if (!isBag(first)) return undefined
	const context = isBag(first.context) ? first.context : first
	const channel = isBag(context.channel) ? context.channel : undefined
	const id = channel?.guild_id
	return typeof id === 'string' && id ? id : undefined
}

/** The id of the app an item belongs to: a section's own id, or a command's `applicationId`. */
const appIdOf = (item: unknown, field: 'id' | 'applicationId'): unknown =>
	isBag(item) ? item[field] : undefined

/** Whether a section (an app) is hidden in this server. A section that has no id of an app is never hidden. */
const sectionHidden = (section: unknown, guildId?: string): boolean =>
	isHidden(appIdOf(section, 'id'), guildId)

/** Whether a command is of a hidden app. Placeholders and built-in commands have no app and stay. */
const commandHidden = (command: unknown, guildId?: string): boolean =>
	isHidden(appIdOf(command, 'applicationId'), guildId)

/**
 * What was filtered for a result, so the same result gives the same filtered copy while nothing changed. Discord compares
 * these lists when it decides whether to draw again, and a new copy on every draw would make it draw forever.
 */
interface Filtered {
	revision: number
	guildId: string | undefined
	out: unknown
}
const copies = new WeakMap<object, Filtered>()

/** Calls `make` for a result once for each revision of the lists and server, and keeps what it made. */
function memoized(
	result: object,
	guildId: string | undefined,
	make: () => unknown,
): unknown {
	const revision = getRevision()
	const known = copies.get(result)
	if (known && known.revision === revision && known.guildId === guildId)
		return known.out
	const out = make()
	copies.set(result, { revision, guildId, out })
	return out
}

/** The list without the hidden items, or the same list when nothing in it is hidden. Returns how many were removed too. */
function without<T>(
	list: unknown,
	hidden: (item: T) => boolean,
): { list: unknown; removed: number } {
	if (!Array.isArray(list)) return { list, removed: 0 }
	const kept = list.filter(item => !hidden(item as T))
	return kept.length === list.length
		? { list, removed: 0 }
		: { list: kept, removed: list.length - kept.length }
}

/** Filters what `useDiscovery` returned. */
function filterDiscovery(result: unknown, guildId?: string): unknown {
	if (!isBag(result) || !hasHidden(guildId)) return result
	return memoized(result, guildId, () => {
		const sections = without(result.sectionDescriptors, s =>
			sectionHidden(s, guildId),
		)
		const active = without(result.activeSections, s =>
			sectionHidden(s, guildId),
		)
		const grouped = without<Bag>(result.commandsByActiveSection, group =>
			sectionHidden(group?.section, guildId),
		)
		const commands = without(result.commands, c => commandHidden(c, guildId))
		if (
			!sections.removed &&
			!active.removed &&
			!grouped.removed &&
			!commands.removed
		)
			return result
		state.discoveryFiltered++
		state.appsRemoved += sections.removed
		state.commandsRemoved += commands.removed
		return {
			...result,
			sectionDescriptors: sections.list,
			activeSections: active.list,
			commandsByActiveSection: grouped.list,
			commands: commands.list,
		}
	})
}

/** Filters what `useQuery` returned. */
function filterQuery(result: unknown, guildId?: string): unknown {
	if (!isBag(result) || !hasHidden(guildId)) return result
	return memoized(result, guildId, () => {
		const commands = without(result.commands, c => commandHidden(c, guildId))
		const sections = without(result.sections, s => sectionHidden(s, guildId))
		if (!commands.removed && !sections.removed) return result
		state.queryFiltered++
		state.appsRemoved += sections.removed
		state.commandsRemoved += commands.removed
		return { ...result, commands: commands.list, sections: sections.list }
	})
}

/** Notes what a result looks like, once, so a report shows what this Discord returns. */
function noteShape(kind: 'discovery' | 'query', result: unknown): void {
	if (!isBag(result)) return
	if (kind === 'discovery' && !state.discoveryShape) {
		state.discoveryShape = shape(result)
		const first = Array.isArray(result.sectionDescriptors)
			? result.sectionDescriptors[0]
			: undefined
		if (first && !state.sectionShape) state.sectionShape = shape(first)
		const group = Array.isArray(result.commandsByActiveSection)
			? (result.commandsByActiveSection[0] as Bag | undefined)
			: undefined
		const command = Array.isArray(group?.data) ? group.data[0] : undefined
		if (command && !state.commandShape) state.commandShape = shape(command)
	}
	if (kind === 'query' && !state.queryShape) {
		state.queryShape = shape(result)
		const first = Array.isArray(result.commands)
			? result.commands[0]
			: undefined
		if (first && !state.commandShape) state.commandShape = shape(first)
	}
}

/**
 * A hook that makes the component using it draw again when the lists of hidden apps change, so an app disappears from the
 * open menu at once. It runs on every call, before Discord's own hook, so the order of hooks never changes.
 */
function useRevision(): void {
	useSyncExternalStore(onRevision, getRevision)
}

/** Wraps one hook. Whatever goes wrong inside, Discord's own result is what comes back. */
function wrap(
	original: Hook,
	kind: 'discovery' | 'query',
): (args: unknown[], original: Hook) => unknown {
	return (args, run) => {
		useRevision()
		const result = run(...args)
		try {
			if (kind === 'discovery') state.discoveryCalls++
			else state.queryCalls++
			noteShape(kind, result)
			const guildId = guildOf(args)
			return kind === 'discovery'
				? filterDiscovery(result, guildId)
				: filterQuery(result, guildId)
		} catch (error) {
			diag.fail(`filter ${kind}`, error)
			return result
		}
	}
}

/** Modules whose hooks are already wrapped. */
const patched = new WeakSet<object>()

/**
 * Finds Discord's module with the hooks, now or when Discord loads it, and wraps them.
 *
 * @param cleanup Where to register what undoes it.
 */
export function installFilter(
	cleanup: (...fns: Array<() => unknown>) => unknown,
): void {
	cleanup(
		getModules(withProps('useDiscovery', 'useQuery'), (exports: unknown) => {
			const module = exports as { default?: unknown } | null
			const api = [exports, module?.default].find(
				candidate =>
					isBag(candidate) &&
					typeof (candidate as Partial<QueryApi>).useDiscovery === 'function' &&
					typeof (candidate as Partial<QueryApi>).useQuery === 'function',
			) as QueryApi | undefined
			if (!api || patched.has(api)) return
			patched.add(api)
			state.moduleSeen = true
			diag.log('found', 'Found the module with useDiscovery and useQuery')

			for (const [name, kind] of [
				['useDiscovery', 'discovery'],
				['useQuery', 'query'],
			] as const) {
				cleanup(
					diag.apply(name, () => {
						try {
							const unpatch = valenced.patcher.instead(
								api as unknown as Record<string, Hook>,
								name,
								wrap(api[name], kind) as never,
							)
							state[kind] = 'patched'
							return unpatch
						} catch (error) {
							state[kind] = 'failed'
							throw error
						}
					}),
				)
			}
		}),
	)
}
