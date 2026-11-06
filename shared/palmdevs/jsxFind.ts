/**
 * Finds Discord's components by watching the JSX runtime, instead of searching Discord's modules.
 *
 * Every time Discord draws a component it calls `jsx` or `jsxs` with the component as the first argument. A rule here names a
 * component (the name of its function, or its `displayName`), and the helper calls the rule when an element of that
 * component is made. That needs no search of Discord's modules, so it works for components in modules that Discord loads
 * late, and the plugin is told before the component is first drawn.
 *
 * A rule can also replace the component for the element that is being made, which is how a plugin changes what a component
 * draws without patching the module that has it.
 *
 * Only `jsx` and `jsxs` are patched, never `createElement`, so a plugin can draw its own elements with `createElement` without
 * coming back through the hook.
 */

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** One component to look for. */
export interface JsxRule {
	/** The name of the component's function, or its `displayName`. */
	name: string
	/**
	 * Called the first time an element of a component that matches is made, with the component as Discord gave it (the function,
	 * or the `React.memo` or `forwardRef` object around it).
	 */
	seen?(type: unknown): void
	/**
	 * Called for every element of a component that matches. Returns the component to use instead, or nothing to keep Discord's.
	 * The same component must be returned for the same input every time, or React starts a new component on each draw.
	 */
	replace?(type: unknown): unknown
}

/** The pieces of a component's type that carry its name. */
interface NamedType {
	name?: unknown
	displayName?: unknown
	type?: unknown
	render?: unknown
}

/** Whether a component, or what it wraps, has this name. Wrappers are `React.memo` (has `type`) and `forwardRef`. */
function hasName(type: unknown, name: string): boolean {
	let current: unknown = type
	// A memo of a forwardRef of a function is three deep.
	for (let depth = 0; depth < 4 && current != null; depth++) {
		if (typeof current !== 'function' && typeof current !== 'object')
			return false
		const named = current as NamedType
		if (named.displayName === name || named.name === name) return true
		current = named.type ?? named.render
	}
	return false
}

/** What the hook remembers about a component it has already looked at. */
interface Verdict {
	rule: JsxRule | null
}

/**
 * Installs one hook on the JSX runtime that runs the rules.
 *
 * @param cleanup Where to register what takes the hook off.
 * @param rules The components to look for.
 * @returns Whether the hook was installed.
 */
export function installJsxFinder(cleanup: Cleanup, rules: JsxRule[]): boolean {
	const runtime = valenced.react.ReactJSXRuntime as unknown as
		| Record<string, unknown>
		| undefined
	if (!runtime || typeof runtime.jsx !== 'function') return false

	/** What was decided for each component, so the names are only compared once per component. */
	const verdicts = new WeakMap<object, Verdict>()
	/** Components a rule has already been told about. */
	const told = new WeakMap<object, Set<JsxRule>>()

	const judge = (type: unknown): JsxRule | null => {
		if (
			type == null ||
			(typeof type !== 'function' && typeof type !== 'object')
		)
			return null
		const cached = verdicts.get(type as object)
		if (cached) return cached.rule
		let rule: JsxRule | null = null
		for (const candidate of rules) {
			if (hasName(type, candidate.name)) {
				rule = candidate
				break
			}
		}
		verdicts.set(type as object, { rule })
		return rule
	}

	for (const key of ['jsx', 'jsxs'] as const) {
		if (typeof runtime[key] !== 'function') continue
		cleanup(
			valenced.patcher.instead(
				runtime as Record<string, (...args: unknown[]) => unknown>,
				key,
				((args: unknown[], original: (...passed: unknown[]) => unknown) => {
					try {
						const type = args[0]
						const rule = judge(type)
						if (rule) {
							if (rule.seen) {
								let rules_ = told.get(type as object)
								if (!rules_) told.set(type as object, (rules_ = new Set()))
								if (!rules_.has(rule)) {
									rules_.add(rule)
									try {
										rule.seen(type)
									} catch (error) {
										console.warn('[jsxFind] seen failed:', String(error))
									}
								}
							}
							if (rule.replace) {
								const next = rule.replace(type)
								if (next != null) args[0] = next
							}
						}
					} catch (error) {
						console.warn('[jsxFind] rule failed:', String(error))
					}
					return original(...args)
				}) as never,
			),
		)
	}
	return true
}
