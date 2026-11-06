import { getModules, lookupModule } from '@valenced/modules/finders'
import { withDependencies, withProps } from '@valenced/modules/finders/filters'

/**
 * Matches modules whose dependencies contain the sheet's creator.
 *
 * The helpers are read on each call, never at module load: the runtime hands out
 * `valenced.modules.finders.filters` late, and touching it while this module
 * evaluates throws and takes the whole library down with it.
 *
 * The published types are also ahead of the runtime. They mark `includes` as
 * deprecated in favour of `unordered`, but a runtime on the older set leaves
 * that `undefined`, and calling it throws where `includes` works. Prefer the
 * replacement, fall back otherwise, which also survives `includes` being
 * removed later.
 */
function dependsOn(creator: unknown, maxDeps: number) {
	const helpers = withDependencies as unknown as {
		atMost?: (count: number, deps: unknown) => unknown
		unordered?: (deps: unknown) => unknown
		includes?: (deps: unknown) => unknown
	}
	const contains = helpers.unordered ?? helpers.includes
	// Both helpers mutate and return the array, so the id has to be wrapped.
	const deps = contains === undefined ? [creator] : contains([creator])
	const bounded =
		helpers.atMost === undefined ? deps : helpers.atMost(maxDeps, deps)
	return withDependencies(bounded as never)
}
export type Sheet = (...args: unknown[]) => unknown

/**
 * How to find a sheet that Discord only evaluates when it opens the real one.
 *
 * This module deliberately knows about no specific sheet. Each plugin declares
 * the sheets it owns, so a new sheet never requires a change here.
 */
export type SheetSpec = {
	/**
	 * Export the sheet is reached by.
	 *
	 * Match every export the module is known to have when the name is uncertain
	 * across Discord versions; `withProps` requires all of them to be present.
	 */
	prop: string | string[]
	/**
	 * A member of the creator the sheet calls into, used to find the sheet among
	 * the modules that depend on it. `openLazy` for action sheets, `pushLazy`
	 * for modals.
	 */
	anchor: string
	/**
	 * Upper bound on the sheet's dependency count, to keep force-init cheap.
	 *
	 * @default 20
	 */
	maxDeps?: number
}

const DEFAULT_MAX_DEPS = 20

/** Reads the sheet off a matched module, checking the namespace then its default. */
function readSheet(
	exports: unknown,
	props: string | string[],
): Sheet | undefined {
	const namespace = exports as Record<string, unknown> | undefined
	if (!namespace) return undefined

	const names = typeof props === 'string' ? [props] : props
	const candidates: unknown[] = []

	for (const name of names) {
		candidates.push(namespace[name])
		candidates.push(
			(namespace.default as Record<string, unknown> | undefined)?.[name],
		)
	}
	candidates.push(namespace.default)

	for (const candidate of candidates)
		if (typeof candidate === 'function') return candidate as Sheet

	return undefined
}

/**
 * Resolves a sheet, memoizing it per spec.
 *
 * `withProps` alone can only see initialized modules, and Discord does not
 * evaluate a sheet until it opens the real one, so on its own it never matches.
 * Pairing it with `withDependencies` is what makes this work: that filter is
 * exportsless, so it can match a module that is not initialized yet and force it
 * to initialize, after which the prop filter can read its exports. The
 * dependency it is anchored on is the creator the sheet calls into, which is
 * always present at startup.
 *
 * `getModules` backs this up for the case where Discord initializes the sheet on
 * its own later, so the first tap is not wasted.
 *
 * Pass a stable object: results are memoized by spec identity.
 */
export function resolveSheet(spec: SheetSpec): Sheet | undefined {
	const cached = memo.get(spec)
	if (cached) return cached

	// A throw here would escape into whatever called us, and callers include
	// render and press handlers. Swallow it: a sheet that cannot be found is a
	// no-op, never a broken screen.
	let sheet: Sheet | undefined
	try {
		sheet = find(spec)
	} catch {
		return undefined
	}

	if (sheet) {
		memo.set(spec, sheet)
		return sheet
	}

	if (!listening.has(spec)) {
		listening.add(spec)
		getModules(propsFilter(spec.prop), exports => {
			const value = readSheet(exports, spec.prop)
			if (value) memo.set(spec, value)
		})
	}

	return undefined
}

const memo = new Map<SheetSpec, Sheet>()
const listening = new Set<SheetSpec>()

/** `withProps` has a fixed first argument, so the first name cannot be spread. */
function propsFilter(props: string | string[]) {
	const [prop, ...rest] = typeof props === 'string' ? [props] : props
	return withProps(prop, ...rest)
}

function find(spec: SheetSpec): Sheet | undefined {
	// The anchor is resolved from already-initialized modules only, so looking it
	// up never forces a factory to run.
	const [, creators] = lookupModule(withProps(spec.anchor))
	if (creators === undefined) return undefined

	const [namespace] = lookupModule(
		propsFilter(spec.prop).and(
			dependsOn(creators, spec.maxDeps ?? DEFAULT_MAX_DEPS),
		),
		{ returnNamespace: true },
	)

	return readSheet(namespace, spec.prop)
}
