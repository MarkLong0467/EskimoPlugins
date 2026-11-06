import { withStoreName } from '@valenced/discord/flux'
import { lookupModule, lookupModules } from '@valenced/modules/finders'
import {
	withDependencies,
	withName,
	withProps,
} from '@valenced/modules/finders/filters'
import type { Filter } from '@valenced/modules/finders/filters'

// Mirrors the working serverdrawer (revenge-plugins) finder strategy:
// plain lookupModule with { cached: false }, and a dependency-walk to reach
// lazy-chunked modules that only import from a known initialized store.

export function findModuleByProps(...props: string[]): any {
	if (props.length === 0) return undefined
	try {
		return lookupModule(withProps(props[0], ...props.slice(1)), {
			cached: false,
		})[0]
	} catch {
		return undefined
	}
}

// Finds a module exporting all of `props`, initialising lazy modules that only
// depend on a known-initialised store (e.g. transitionToChannel).
function lookupUsingStore(storeName: string, filter: Filter): any {
	const direct = lookupModule(filter, { cached: false })[0]
	if (direct) return direct
	const stores = [storeName, 'GuildStore', 'UserSettingsProtoStore']
	const ids = [
		...new Set(
			stores.flatMap(name =>
				[...lookupModules(withStoreName(name), { cached: false })].map(
					([, id]: any) => id,
				),
			),
		),
	]
	for (const id of ids) {
		const dependency = withDependencies.unordered([id])
		for (const pattern of [
			dependency,
			withDependencies.unordered([dependency]),
		]) {
			const result = lookupModule(withDependencies(pattern).and(filter), {
				cached: false,
			})[0]
			if (result) return result
		}
	}
	return undefined
}

export function findModuleByPropsUsingStore(
	storeName: string,
	...props: string[]
): any {
	if (props.length === 0) return undefined
	try {
		return lookupUsingStore(storeName, withProps(props[0], ...props.slice(1)))
	} catch {
		return undefined
	}
}

// Same store-anchored walk, but for a default-exported named function. The stock
// guild menu builder (`getGuildsBarGuildMenuItems`) is only ever required from
// inside the stock long-press gesture, which never runs once this plugin
// replaces the guilds bar, so it needs the dependency walk to be reachable.
export function findFunctionByNameUsingStore(
	storeName: string,
	name: string,
): any {
	try {
		const found = lookupUsingStore(storeName, withName(name))
		return typeof found === 'function' && found.name === name
			? found
			: undefined
	} catch {
		return undefined
	}
}

// Finds a function with the exact export name; also handles default-exported
// named functions (the guilds bar util) and named functions nested anywhere in
// the exports object.
export function findFunctionByName(name: string): any {
	try {
		const target = lookupModule(withName(name), { cached: false })[0]
		if (typeof target === 'function' && target.name === name) return target
		if (target != null && typeof target === 'object') {
			const mod = target as Record<string, any>
			if (typeof mod.default === 'function' && mod.default.name === name) {
				return mod.default
			}
			for (const key of Object.keys(mod)) {
				const value = mod[key]
				if (typeof value === 'function' && value.name === name) return value
			}
		}
		return undefined
	} catch {
		return undefined
	}
}
