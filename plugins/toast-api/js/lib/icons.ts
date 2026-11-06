import { onImportedPath } from './finders'
import type { ToastVariant } from '../types'

const PATHS: Record<string, string> = {
	CircleCheckIcon:
		'design/components/Icon/native/redesign/generated/CircleCheckIcon.tsx',
	CircleErrorIcon:
		'design/components/Icon/native/redesign/generated/CircleErrorIcon.tsx',
	CircleInformationIcon:
		'design/components/Icon/native/redesign/generated/CircleInformationIcon.tsx',
	WarningIcon:
		'design/components/Icon/native/redesign/generated/WarningIcon.tsx',
	Icon: 'design/void/Icon/native/Icon.tsx',
}

const SUBSTITUTIONS_PATH = 'modules/toast/native/toastIconSubstitutions.tsx'
const components = new Map<string, any>()
const pending = new Set<string>()
let onResolved: (() => void) | undefined

/** Called whenever a late module resolution lands, so mounted toasts can repaint. */
export function setOnIconResolved(cb: () => void): void {
	onResolved = cb
}

/** Resolve (and cache) a Discord icon component by export name. */
export function getIconComponent(name: string): any {
	const cached = components.get(name)
	if (cached !== undefined) return cached
	const path = PATHS[name]
	if (!path || pending.has(name)) return undefined
	pending.add(name)
	onImportedPath(path, ns => {
		pending.delete(name)
		// The generated icons are named exports; Icon.tsx ships its component as
		// the default export.
		const found = name === 'Icon' ? ns?.default : ns?.[name]
		if (found != null) {
			components.set(name, found)
			onResolved?.()
		}
	})
	return components.get(name)
}

export interface IconSubstitutions {
	status: Map<any, string>
	png: Map<number, any>
}

let substitutions: IconSubstitutions | undefined
let watchingSubstitutions = false

/**
 * Discord's own legacy → mana icon mapping. `status` turns a legacy `IconComponent`
 * into a variant; `png` turns a packager asset id into either a variant or an
 * `IconComponent`.
 */
export function getIconSubstitutions(): IconSubstitutions | undefined {
	if (substitutions === undefined && !watchingSubstitutions) {
		watchingSubstitutions = true
		onImportedPath(SUBSTITUTIONS_PATH, ns => {
			const status = ns?.TOAST_STATUS_ICONS
			const png = ns?.TOAST_PNG_SUBSTITUTIONS
			if (status instanceof Map && png instanceof Map) {
				substitutions = { status, png }
				onResolved?.()
			}
		})
	}
	return substitutions
}

export const VARIANT_ICON: Record<ToastVariant, string | undefined> = {
	default: undefined,
	success: 'CircleCheckIcon',
	critical: 'CircleErrorIcon',
	info: 'CircleInformationIcon',
	warning: 'WarningIcon',
}

/** Kick off every resolution we will need before the first toast renders. */
export function warmIcons(): void {
	for (const name of Object.values(VARIANT_ICON)) {
		if (name) getIconComponent(name)
	}
	getIconComponent('Icon')
	getIconSubstitutions()
}
