import { getSettings, setSettings } from './settings'

let showCustomColorPicker: any

function resolveShowCustomColorPicker(): any {
	if (typeof showCustomColorPicker === 'function') return showCustomColorPicker

	const finders = valenced.modules.finders
	const filters = finders.filters

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
		// leave undefined → pickSeedColor no-ops
	}

	if (typeof exports === 'function') {
		showCustomColorPicker = exports
		return exports
	}
	return undefined
}

function hexToInt(hex: string): number | undefined {
	if (!hex.startsWith('#')) return undefined
	const body = hex.slice(1)
	const full =
		body.length === 3
			? body
					.split('')
					.map(c => c + c)
					.join('')
			: body
	const parsed = Number.parseInt(full, 16)
	return Number.isNaN(parsed) ? undefined : parsed & 0xffffff
}

/** Open Discord's native colour picker for the fallback seed. */
export function pickSeedColor(): void {
	const show = resolveShowCustomColorPicker()
	if (typeof show !== 'function') return
	const current = getSettings().seed
	const initial = hexToInt(current) ?? 0x6750a4
	show({
		color: initial,
		onSelect: (color: number) => {
			if (typeof color !== 'number') return
			setSettings({
				seed: `#${((color & 0xffffff) >>> 0).toString(16).padStart(6, '0')}`,
			})
		},
	})
}
