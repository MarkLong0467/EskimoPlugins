let container: any
const PLUGIN_ID = 'marklong.declutter'

export function initKmmiioLib(api: any) {
	container = api
}

/**
 * The library instance, read through the api on every call.
 *
 * The api object is stable but `unscoped.kmmiio` is filled in by the lib
 * plugin's `decorate`, which can land after this plugin's `start` runs. Holding
 * the value instead of the api would freeze `undefined` into the stash and
 * every later call, `forceLoadLazySheets` among them, would stay a no-op.
 */
export function kmmiioLib(): any {
	return container?.unscoped?.kmmiio
}

function log(module: string, action: string, found: boolean) {
	kmmiioLib()?.logUsage?.(PLUGIN_ID, module, action, found)
}

export function getDefaultNameFilter(name: string) {
	const result = kmmiioLib()?.getDefaultNameFilter(name)
	log('filter:defaultName', 'create', result != null)
	return result
}

export function getPropsFilter(...props: string[]) {
	const result = kmmiioLib()?.getPropsFilter(...props)
	log('filter:props', 'create', result != null)
	return result
}

export function getProfileFrameComponentFilter() {
	const result = kmmiioLib()?.getProfileFrameComponentFilter()
	log('filter:profileFrame', 'create', result != null)
	return result
}

export function resolveComponent(exports: any): any {
	return kmmiioLib()?.resolveComponent(exports)
}

export function safeInstead<
	Parent extends Record<Key, any>,
	Key extends keyof Parent,
>(
	parent: Parent,
	key: Key,
	hook: (args: any[], original: Parent[Key]) => any,
): () => void {
	const result = kmmiioLib()?.safeInstead(parent, key, hook)
	log('patcher:instead', 'patch', result != null && result !== (() => {}))
	return result ?? (() => {})
}

export function safeInsteadJSX(
	component: any,
	hook: (args: any[], jsx: any) => any,
): () => void {
	const result = kmmiioLib()?.safeInsteadJSX(component, hook)
	log('patcher:insteadJSX', 'patch', result != null && result !== (() => {}))
	return result ?? (() => {})
}

export function safeAfterJSX(
	component: any,
	hook: (element: any) => any,
): () => void {
	const result = kmmiioLib()?.safeAfterJSX(component, hook)
	log('patcher:afterJSX', 'patch', result != null && result !== (() => {}))
	return result ?? (() => {})
}

export function onModule(
	filter: any,
	cb: (namespace: any, id: number) => void,
): () => void {
	const result = kmmiioLib()?.onModule(filter, cb)
	log('finder:onModule', 'subscribe', result != null && result !== (() => {}))
	return result ?? (() => {})
}

export function onImportedPath<T = any>(
	path: string,
	cb: (namespace: T, id: number) => void,
): () => void {
	const result = kmmiioLib()?.onImportedPath(path, cb)
	log(
		'finder:onImportedPath',
		'subscribe',
		result != null && result !== (() => {}),
	)
	return result ?? (() => {})
}

/**
 * Patches a component exported by `path`, resolving the component from the
 * module namespace.
 *
 * `onImportedPath` reports a namespace once, and the component is resolved
 * from that snapshot. Resolving can legitimately miss, so this re-attempts on
 * a short interval instead of leaving the option silently inert, and it stops
 * once the component has been found. `seen` keeps a namespace that is still in
 * the registry from being wrapped a second time on every start/stop cycle,
 * which would stack insteadJSX wrappers until the nesting is deep enough for
 * the patch to stop applying. The attempt loop is also what makes a later miss
 * harmless: nothing is scheduled after `dispose`, so a namespace arriving
 * during teardown can no longer install a patch that nothing will ever remove.
 */
export function onComponentPatch(
	path: string,
	hook: (args: any[], jsx: any) => any,
): () => void {
	const cleanups: Array<() => void> = []
	const seen = new Set<any>()
	let disposed = false
	let timer: ReturnType<typeof setTimeout> | undefined

	function tryPatch(exports: any) {
		if (disposed) return
		const component = resolveComponent(exports)
		if (!component || seen.has(component)) return
		seen.add(component)
		if (disposed) return
		cleanups.push(safeInsteadJSX(component, hook))
	}

	function schedule(exports: any, attempt: number) {
		if (disposed || attempt >= 10) return
		timer = setTimeout(() => {
			timer = undefined
			if (disposed) return
			tryPatch(exports)
			schedule(exports, attempt + 1)
		}, 500)
	}

	function handle(exports: any) {
		if (disposed) return
		tryPatch(exports)
		schedule(exports, 0)
	}

	const unsub = onImportedPath<any>(path, handle)

	return () => {
		disposed = true
		if (timer !== undefined) clearTimeout(timer)
		unsub?.()
		// Iterate a snapshot: `handle` can append while cleanup runs.
		for (const un of cleanups.splice(0)) un?.()
	}
}
