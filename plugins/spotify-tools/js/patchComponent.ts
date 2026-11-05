import { instead } from '@valenced/patcher'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** A function that is patched: its first argument is the props of the component. */
type AnyFunction = (...args: unknown[]) => unknown

/**
 * Patches `module[key]` whatever it is: a class, a function component, or a memo / forwardRef wrapper.
 *
 * The patch lets the component render as usual, then hands the element it rendered (and its props) to `decorate`, which
 * returns the element to use. If `decorate` throws, the original element is used.
 *
 * @param module The module that holds the component.
 * @param key The name of the component in the module.
 * @param decorate Gets the rendered element and the props, and returns the element to use.
 * @param cleanup Registers the function that takes the patch off.
 * @returns False when the component is none of those shapes (nothing was patched).
 */
export function patchComponent(
	module: Record<string, unknown>,
	key: string,
	decorate: (ret: unknown, props: unknown) => unknown,
	cleanup: Cleanup,
): boolean {
	const value = module[key] as unknown

	/** Patches `parent[name]`; `getProps` says where the props come from (`this.props` for a class, else the first argument). */
	const patch = (
		parent: Record<string, unknown>,
		name: string,
		getProps: (this: unknown, args: unknown[]) => unknown,
	) => {
		cleanup(
			instead(
				parent as Record<string, AnyFunction>,
				name,
				function (args, original) {
					const ret = Reflect.apply(original, this, args)
					try {
						return decorate(ret, getProps.call(this, args))
					} catch {
						return ret
					}
				},
			),
		)
	}
	const fromThis = function (this: unknown) {
		return (this as { props?: unknown }).props
	}
	const fromArgs = (args: unknown[]) => args[0]

	if (typeof value === 'function') {
		const prototype = (value as { prototype?: Record<string, unknown> })
			.prototype
		if (prototype && typeof prototype.render === 'function')
			patch(prototype, 'render', fromThis)
		else patch(module, key, fromArgs)
		return true
	}
	if (value && typeof value === 'object') {
		const wrapper = value as Record<string, unknown>
		if (typeof wrapper.type === 'function') {
			const prototype = (
				wrapper.type as { prototype?: Record<string, unknown> }
			).prototype
			if (prototype && typeof prototype.render === 'function')
				patch(prototype, 'render', fromThis)
			else patch(wrapper, 'type', fromArgs)
			return true
		}
		if (typeof wrapper.render === 'function') {
			patch(wrapper, 'render', fromArgs)
			return true
		}
	}
	return false
}
