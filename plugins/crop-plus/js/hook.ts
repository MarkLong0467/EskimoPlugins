import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { cropWithPasses } from './crop'
import { inScope } from './options'
import { hooks, problem } from './state'
import type { CropOptions, CropperHolder } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/**
 * Marks which copy of the plugin is running. A copy that was replaced (the plugin reloaded) leaves the cropper alone,
 * even if its patch could not be taken off.
 */
export const INSTANCE = {}

/** The global the running copy's marker is kept in. */
export const INSTANCE_KEY = '__cropPlusInstance'

const registry = globalThis as unknown as Record<string, unknown>

/**
 * Wraps Discord's picture cropper (`openCropper`) so a crop can be repeated on its result.
 *
 * The cropper is found by its functions (`openCropper` and `openPicker`). It is looked for now and also watched for,
 * in case Discord loads it later. A module may carry the functions on itself or on its `default`; each holder is
 * wrapped once. A crop the plugin should not touch (switched off, or not in the chosen scope) is passed straight to the
 * original; so is a crop where the plugin itself fails.
 */
export function hookCropper(cleanup: Cleanup): void {
	const patched = new WeakSet<object>()

	const attach = (module: unknown) => {
		const holders = [
			module,
			(module as { default?: unknown } | undefined)?.default,
		].filter(
			(candidate, index, all) =>
				candidate &&
				(typeof candidate === 'object' || typeof candidate === 'function') &&
				all.indexOf(candidate) === index,
		) as CropperHolder[]

		for (const holder of holders) {
			if (typeof holder.openCropper !== 'function' || patched.has(holder))
				continue
			patched.add(holder)
			cleanup(
				instead(holder, 'openCropper', function (args, original) {
					try {
						if (
							registry[INSTANCE_KEY] !== INSTANCE ||
							!inScope(args[0] as CropOptions | undefined)
						)
							return Reflect.apply(original, this, args)
						return cropWithPasses(
							holder,
							original as CropperHolder['openCropper'],
							args,
						)
					} catch (error) {
						problem('crop', error)
						return Reflect.apply(original, this, args)
					}
				}),
			)
			hooks.cropper = 'found'
			if (!hooks.patched.includes('openCropper'))
				hooks.patched.push('openCropper')
		}
	}

	const run = (module: unknown) => {
		try {
			attach(module)
		} catch (error) {
			problem('hook openCropper', error)
		}
	}

	try {
		cleanup(getModules(withProps('openCropper', 'openPicker'), run))
	} catch (error) {
		problem('watch openCropper', error)
	}
	try {
		const found = lookupModule(withProps('openCropper', 'openPicker'))[0]
		if (found) run(found)
	} catch {
		// The watch above still picks the module up when Discord loads it.
	}
}
