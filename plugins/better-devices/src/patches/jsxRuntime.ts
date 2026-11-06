export type JsxTransform = (type: any, props: any, args: any[]) => void

/**
 * Installs a single hook on the React JSX runtime that sinks every patch
 * transform onto matching elements. Only `jsx`/`jsxs` are patched — never
 * `createElement` — so our own wrappers (which render via createElement to
 * avoid re-entering the hook) cannot cause infinite recursion.
 */
export function installJsxTransformers(
	cleanups: (fn: () => void) => void,
	transforms: JsxTransform[],
): boolean {
	const runtime = valenced.react.ReactJSXRuntime as any
	if (!runtime || typeof runtime.jsx !== 'function') return false

	for (const key of ['jsx', 'jsxs'] as const) {
		if (typeof runtime[key] !== 'function') continue
		cleanups(
			valenced.patcher.instead(runtime, key, (args: any[], original: any) => {
				try {
					for (const transform of transforms) {
						try {
							transform(args[0], args[1], args)
						} catch {
							// ignore
						}
					}
				} catch {
					// ignore
				}
				return Reflect.apply(original, runtime, args)
			}),
		)
	}
	return true
}

export function isFunctionNamed(type: any, name: string): boolean {
	return type != null && typeof type === 'function' && type.name === name
}

/**
 * Matches a component type by name even when the runtime wrapped it, e.g.
 * `memo(Stack)` or `forwardRef(Stack)` where the outer object is not a plain
 * function and `.name` lives one level deeper.
 */
export function isNamedElement(type: any, name: string): boolean {
	if (type == null) return false
	if (typeof type === 'function') return type.name === name
	if (typeof type === 'object') {
		if (type.name === name) return true
		const inner = type.type
		if (typeof inner === 'function') return inner.name === name
		if (typeof inner === 'object' && inner != null) {
			const innerInner = inner.type
			return typeof innerInner === 'function' && innerInner.name === name
		}
	}
	return false
}
