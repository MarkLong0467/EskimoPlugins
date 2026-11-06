/**
 * Assign an export that may sit behind a getter, falling back to a
 * `defineProperty` write so a non-writable slot can still be replaced.
 */
export function patch(target: any, key: string, value: any): boolean {
	if (target == null) return false
	try {
		target[key] = value
		if (target[key] === value) return true
	} catch {}
	try {
		Object.defineProperty(target, key, {
			value,
			configurable: true,
			writable: true,
			enumerable: true,
		})
		return target[key] === value
	} catch {
		return false
	}
}

/**
 * Watch for modules by the exports they carry: the callback runs immediately
 * for modules already initialized and when a match initializes later.
 * `withProps` cannot see uninitialized exports, which is why a plain lookup
 * at start-up misses Discord's lazily required tables — `initialize` cannot
 * help either, since there are no exports to match on yet.
 *
 * Returns an unsubscribe, or undefined when the finder cannot watch.
 */
export function watchModules(
	names: [string, ...string[]],
	callback: (exports: any) => void,
	max?: number,
): (() => void) | undefined {
	try {
		const finders: any = valenced.modules.finders
		const { getModules, lookupModule, filters } = finders
		const filter = filters.withProps(...names)
		const run = (exports: any) => {
			if (exports != null) callback(exports)
		}
		if (typeof getModules === 'function') {
			const unwatch =
				max !== undefined
					? getModules(filter, run, { max })
					: getModules(filter, run)
			return typeof unwatch === 'function' ? unwatch : undefined
		}
		// Older finders: an immediate lookup only, same as before.
		const [exports] = lookupModule(filter, { initialize: true, cached: false })
		if (exports != null) run(exports)
		return () => {}
	} catch {
		return undefined
	}
}
