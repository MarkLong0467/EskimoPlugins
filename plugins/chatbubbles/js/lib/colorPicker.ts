import { getSettings } from './state'

let showCustomColorPicker: any

// `showCustomColorPickerActionSheet` is registered in the main bundle at startup but NOT
// initialized on a fresh session: its only importers are async profile-editor / role-color
// screens, so on a cold start its exports don't exist and `withName` (Initialized scope)
// alone can never match it.
//
// The launcher is one of Discord's `openLazy` action-sheet wrappers. Every such wrapper is
// produced by the same codegen, so its dependency map always starts with
//
//   [ ActionSheetActionCreators, <own function id> ]
//
// where the own function id is always module ID + 1 (`relative(1)`) and
// ActionSheetActionCreators always exposes the stable `openLazy` export. No module IDs are
// hardcoded anywhere in this resolver: the only drifting dependency (ActionSheetActionCreators)
// is located by its export names at runtime and the self-reference is structural, so the
// lookup survives Discord renumbering every module on every update.
//
// `withDependencies` runs in the exportsless scope, so it matches the still-uninitialized
// launcher and forces it to initialize; `withName` then confirms the real exports. Only
// success is cached.
function resolveShowCustomColorPicker(): any {
	if (typeof showCustomColorPicker === 'function') return showCustomColorPicker

	const finders = valenced.modules.finders
	const filters = finders.filters

	// Locate ActionSheetActionCreators by its stable exports — its ID drifts on every build,
	// the export names don't. If it's somehow not initialized yet, fall back to a dynamic
	// dependency (`null`) and let `withName` disambiguate below.
	const actionSheetCreatorId = finders.lookupModule(
		filters.withProps('openLazy', 'hideActionSheet'),
	)?.[1]
	const actionSheetCreatorDep: number | null =
		typeof actionSheetCreatorId === 'number' ? actionSheetCreatorId : null

	let exports: any
	try {
		const found = finders.lookupModule(
			filters
				.withName('showCustomColorPickerActionSheet')
				.and(
					filters.withDependencies(
						filters.withDependencies.ordered([
							actionSheetCreatorDep,
							filters.withDependencies.relative(1),
						]),
					),
				),
			{ initialize: true },
		)
		exports = found?.[0]
	} catch {
		// leave undefined → openNativeColorPicker no-ops
	}

	if (typeof exports === 'function') {
		showCustomColorPicker = exports
		return exports
	}
	return undefined
}

// The picker's `onSelect` hands back an int; format it for display/RN styles.
export function colorIntToHex(color: number): string {
	const value = (color & 0xffffff) >>> 0
	return `#${value.toString(16).padStart(6, '0')}`
}

/**
 * Open Discord's native color picker. Calls `onSelect` with the chosen color as a
 * `0xAARRGGBB` int (alpha forced to `0xFF`). No-ops if the picker module can't be
 * resolved.
 *
 * The picker itself works in 24-bit RGB: its `onSelect`/`color` values carry no alpha
 * (`num()` in the bundled color lib drops it), so we strip alpha on the way in and
 * force it opaque on the way out.
 */
export function openNativeColorPicker(onSelect: (color: number) => void): void {
	const show = resolveShowCustomColorPicker()
	if (typeof show !== 'function') return
	const { bubbleColor } = getSettings()
	show({
		color: typeof bubbleColor === 'number' ? bubbleColor & 0xffffff : 0x000000,
		onSelect: (color: number) => {
			if (typeof color === 'number') onSelect((color & 0xffffff) | 0xff000000)
		},
	})
}
