let kmmiio: any

export function initKmmiioLib(api: any) {
	kmmiio = api
}

/** The shared lib plugin, for its resolvers. */
export function getKmmiio(): any {
	return kmmiio
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

const httpUtilsFn = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps('getAPIBaseURL', 'get', 'post'),
	exports => exports,
)

const assetManagerFn = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps('getAssetIds', 'fetchAssetIds'),
	exports => exports,
)

const activityActionFn = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps('SET_ACTIVITY'),
	exports => exports,
)

export function getHTTPUtils(): any {
	return kmmiio?.getHTTPUtils?.() ?? httpUtilsFn()
}

export function getAssetManager(): any {
	return kmmiio?.getAssetManager?.() ?? assetManagerFn()
}

export function primeActivityModule(): any {
	return kmmiio?.primeActivityModule?.() ?? activityActionFn()
}
