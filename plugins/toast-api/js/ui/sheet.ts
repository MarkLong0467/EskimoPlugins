import type { ComponentType } from 'react'

export const SHEET = {
	layout: 'toast-api-layout',
	text: 'toast-api-text',
	icon: 'toast-api-icon',
	subtitle: 'toast-api-subtitle',
	timing: 'toast-api-timing',
	placement: 'toast-api-placement',
	colours: 'toast-api-colours',
} as const

function actions() {
	return valenced.discord.actions?.ActionSheetActionCreators
}

/**
 * Open an action sheet. Follows the documented `ActionSheetActionCreators.openLazy`
 * shape: a lazy module with the component on `default`, plus a key to close it again.
 */
export function openSheet(key: string, Component: ComponentType<any>): void {
	try {
		actions()?.openLazy?.(Promise.resolve({ default: Component }), key, {})
	} catch {
		// ignore
	}
}

export function closeSheet(key: string): void {
	try {
		actions()?.hideActionSheet?.(key)
	} catch {
		// ignore
	}
}
