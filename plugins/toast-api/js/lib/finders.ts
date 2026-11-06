type Unsub = () => void

/**
 * Subscribe to a module by its imported path. The callback fires immediately if the
 * module is already initialized, otherwise once it is.
 */
export function onImportedPath<T = any>(
	path: string,
	cb: (namespace: T, id: number) => void,
): Unsub {
	try {
		return valenced.discord.utils.modules.finders.getModuleWithImportedPath<T>(
			path,
			(namespace, id) => cb(namespace, id as number),
		)
	} catch {
		return () => {}
	}
}

/** Synchronous lookup. Returns `undefined` when the module is not initialized yet. */
export function lookupPath<T = any>(path: string): T | undefined {
	try {
		const [exports] =
			valenced.discord.utils.modules.finders.lookupModuleWithImportedPath<T>(
				path,
			)
		return exports
	} catch {
		return undefined
	}
}
