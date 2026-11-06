import { getSettings, setSettings } from './settings'
import type { ToastApiSettings } from '../types'

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
		// leave undefined → openNativeColorPicker no-ops
	}

	if (typeof exports === 'function') {
		showCustomColorPicker = exports
		return exports
	}
	return undefined
}

/** Format the picker's `0xRRGGBB` int for display / RN styles. */
export function colorIntToHex(color: number): string {
	const value = (color & 0xffffff) >>> 0
	return `#${value.toString(16).padStart(6, '0')}`
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

/**
 * Open Discord's native color picker, then write the chosen `#hex` into a settings key.
 * No-ops if the picker module can't be resolved.
 */
export function pickSettingColor(key: keyof ToastApiSettings): void {
	const show = resolveShowCustomColorPicker()
	if (typeof show !== 'function') return
	const current = getSettings()[key]
	const initial =
		typeof current === 'string' && current.length > 0
			? (hexToInt(current) ?? 0x000000)
			: 0x000000
	show({
		color: initial,
		onSelect: (color: number) => {
			if (typeof color === 'number') {
				setSettings({
					[key]: colorIntToHex(color),
				} as Partial<ToastApiSettings>)
			}
		},
	})
}
