import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { copyText } from './clipboard'
import { roleColor } from './color'
import { decorateSheet } from './decorate'
import { toast } from './toast'
import type { Node, Role } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/**
 * Patches the JSX runtime, so every element Discord creates passes through `decorateSheet`, which adds the options to
 * the role menu.
 *
 * The runtime Discord itself uses is looked up by its functions. If it cannot be found, the one Valenced provides is
 * used. `jsx` creates elements with one child and `jsxs` with several, so both are patched.
 */
export function patchJsxRuntime(cleanup: Cleanup): void {
	// A namespace import of 'react/jsx-runtime' would be a read-only copy that cannot be patched, so the runtime Valenced
	// provides is reached through the unscoped API instead, which is the one place this plugin needs it.
	const runtime =
		(lookupModule(withProps('jsx', 'jsxs'))[0] as
			| Record<string, unknown>
			| undefined) ||
		(valenced.react.ReactJSXRuntime as unknown as Record<string, unknown>)
	for (const name of ['jsx', 'jsxs']) {
		if (runtime && typeof runtime[name] === 'function') {
			cleanup(
				after(
					runtime as Record<string, (...args: unknown[]) => unknown>,
					name,
					decorateSheet as never,
				),
			)
		}
	}
}

/**
 * Patches the role chip on a profile (`ThemedRolePill`), so holding a role copies its color.
 *
 * The chip is drawn normally and then given an `onLongPress`, but only if it can be tapped (it has an `onPress`) and a
 * color for it can be found. Anything that goes wrong draws the chip as Discord would.
 */
export function patchRolePill(module: unknown, cleanup: Cleanup): void {
	const target = module as { default?: unknown } | null | undefined
	if (!target || typeof target.default !== 'function') return

	cleanup(
		instead(
			target as { default: (...args: unknown[]) => Node },
			'default',
			function (args, original) {
				const ret = Reflect.apply(original, this, args)
				try {
					if (!ret?.props || typeof ret.props.onPress !== 'function') return ret
					const color = roleColor(args[0] as { role?: Role } | undefined, ret)
					if (!color) return ret

					return {
						...ret,
						props: {
							...ret.props,
							onLongPress: () => {
								copyText(color)
								toast(`Copied ${color}`)
							},
						},
					}
				} catch {
					return ret
				}
			},
		),
	)
}
