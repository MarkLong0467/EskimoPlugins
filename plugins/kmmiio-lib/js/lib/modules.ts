let activePluginId = 'unknown'

export function setActivePlugin(id: string) {
	activePluginId = id
}

export function getActivePluginId() {
	return activePluginId
}

export function lazy<T>(resolve: () => T): () => T {
	let value: T
	let done = false
	return () => {
		if (!done) {
			value = resolve()
			done = true
		}
		return value
	}
}

export function createModuleGetter<T>(
	filter: any,
	resolve: (exports: any) => T | undefined,
): () => T | undefined {
	const { getModules, lookupModule } = valenced.modules.finders
	let cached: T | undefined
	let done = false
	let unsub: (() => void) | undefined

	try {
		unsub = getModules(
			filter,
			(exports: any) => {
				try {
					const resolved = resolve(exports)
					if (resolved !== undefined) {
						cached = resolved
						done = true
						unsub?.()
					}
				} catch {}
			},
			{ returnNamespace: true },
		)
	} catch {}

	return () => {
		if (done) return cached
		try {
			const resolved = resolve(lookupModule(filter)?.[0])
			if (resolved !== undefined) {
				cached = resolved
				done = true
			}
		} catch {}
		return cached
	}
}

export function createStoreGetter(name: string): () => any {
	const { getStore, Stores } = valenced.discord.flux
	let cached: any
	let done = false
	let unsub: (() => void) | undefined

	try {
		unsub = getStore(name, (store: any) => {
			cached = store
			done = true
			unsub?.()
		})
	} catch {}

	return () => {
		if (done) return cached
		try {
			const viaProxy = (Stores as any)[name]
			if (viaProxy) {
				cached = viaProxy
				done = true
			}
		} catch {}
		return cached
	}
}

export function isComponentType(v: any): boolean {
	if (typeof v === 'function') return true
	if (v && typeof v === 'object') {
		const t = v.$$typeof
		return (
			t === Symbol.for('react.memo') ||
			t === Symbol.for('react.forward_ref') ||
			t === Symbol.for('react.provider')
		)
	}
	return false
}

export function resolveComponent(exports: any): any {
	if (!exports) return undefined
	if (isComponentType(exports)) return exports
	if (isComponentType(exports?.default)) return exports.default
	if (isComponentType(exports?.type)) return exports.type
	if (isComponentType(exports?.default?.type)) return exports.default.type
	return undefined
}
