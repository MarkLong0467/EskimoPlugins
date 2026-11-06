import {
	createFilterGenerator,
	FilterScopes,
	withProps,
} from '@valenced/modules/finders/filters'

/**
 * Finders the PalmDevs ports share. Each one makes its filter when it is called, which is after the plugin has started, so
 * nothing runs when the file is loaded.
 *
 * Revenge, which the originals were written for, finds modules with `findByProps` and `findByTypeName`; these are the same
 * searches in Valenced's finders.
 */

/** Whether something can have properties. */
const isObjectLike = (value: unknown): value is Record<string, unknown> =>
	value != null && (typeof value === 'object' || typeof value === 'function')

/**
 * A filter for modules that have all of the named properties (on the module, or on its default export).
 *
 * This is Valenced's own `withProps`, which is the search the other plugins use. A search of your own made with
 * `createFilterGenerator` should only be used when `withProps` cannot do it.
 */
export function propsFilter(...props: string[]) {
	const [first, ...rest] = props
	return withProps(first as string, ...rest)
}

/**
 * A filter for a component that is wrapped in `React.memo` and has the given `displayName` (what Revenge's
 * `findByTypeDisplayName` matches), on the module or on its default export.
 */
export function displayNameFilter(name: string) {
	return createFilterGenerator<[name: string]>(
		([wanted], _id, exports: unknown) => {
			const e = exports as {
				type?: { displayName?: string }
				default?: { type?: { displayName?: string } }
			} | null
			return (
				e?.type?.displayName === wanted ||
				e?.default?.type?.displayName === wanted
			)
		},
		([wanted]) => `palmdevs.displayName(${wanted})`,
		FilterScopes.Initialized,
	)(name)
}

/**
 * A filter for a component that is wrapped in `React.memo` and whose function has the given name (what Revenge's
 * `findByTypeName` matches), on the module or on its default export.
 */
export function typeNameFilter(name: string) {
	return createFilterGenerator<[name: string]>(
		([wanted], _id, exports: unknown) => {
			const e = exports as {
				type?: { name?: string }
				default?: { type?: { name?: string } }
			} | null
			return e?.type?.name === wanted || e?.default?.type?.name === wanted
		},
		([wanted]) => `palmdevs.typeName(${wanted})`,
		FilterScopes.Initialized,
	)(name)
}

/** A `React.memo` object: it keeps the component it wraps in `type`. */
export interface MemoComponent<T = unknown> {
	$$typeof?: symbol
	type: T
}

/**
 * The `React.memo` object inside what a finder returned, which is either the memo object itself or a module that has it as
 * its default export.
 */
export function memoOf<T = unknown>(
	exports: unknown,
): MemoComponent<T> | undefined {
	const e = exports as { type?: unknown; default?: { type?: unknown } } | null
	if (isObjectLike(e) && 'type' in e && e.type != null)
		return e as unknown as MemoComponent<T>
	const d = e?.default
	if (isObjectLike(d) && 'type' in d && d.type != null)
		return d as unknown as MemoComponent<T>
	return undefined
}
