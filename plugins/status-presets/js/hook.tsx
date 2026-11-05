import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { cloneElement } from 'react'
import { setting } from './config'
import { EditorPresets, SheetPresets } from './SheetPresets'
import { found, INSTANCE, INSTANCE_KEY } from './state'
import type { ReactElement } from 'react'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** A drawn element that is looked into without knowing its exact kind. */
interface Node {
	key?: unknown
	props?: Record<string, unknown> & { children?: unknown }
}

/**
 * True for the "Set your status" screen: a column of [preview, status box, "Clear at" row group, optional "Delete
 * status" group]. The "Clear at" group holds one row with an arrow and a trailing value.
 */
function isStatusEditor(element: Node): boolean {
	const kids = element?.props?.children as Node[] | undefined
	if (!Array.isArray(kids) || kids.length < 3 || kids.length > 4) return false
	const status = kids[1]?.props?.children
	if (!Array.isArray(status) || status.length !== 2) return false
	const group = kids[2]?.props
	if (!group || group.hasIcons !== false) return false
	const row = (
		Array.isArray(group.children) ? group.children[0] : group.children
	) as Node | undefined
	return !!(row?.props && row.props.arrow === true && row.props.trailing)
}

/** True for the block with the four status rows (online, idle, dnd, invisible), found by their keys. */
function isStatusPicker(element: Node): boolean {
	const kids = element?.props?.children as Node[] | undefined
	if (!Array.isArray(kids) || kids.length !== 2) return false
	const rows = kids[1]?.props?.children as Node[] | undefined
	if (!Array.isArray(rows)) return false
	const keys = rows.map(row => row?.key)
	return (
		keys.includes('dnd') && keys.includes('online') && keys.includes('idle')
	)
}

/**
 * Patches the JSX runtime so every element Discord creates passes through here. The account sheet's status picker gets
 * the presets added after it, and the "Set your status" screen gets them between "Clear at" and "Delete status". Each
 * is only done when its setting is on and only once per element. A copy of the plugin that was replaced leaves screens
 * alone, and anything unexpected returns the element as it was.
 */
export function hookStatusSheet(cleanup: Cleanup): void {
	// The runtime Discord itself uses is found by its functions; the one Valenced provides is the fallback. It is reached
	// through the unscoped API because a namespace import of 'react/jsx-runtime' would be a read-only copy.
	const runtime =
		(lookupModule(withProps('jsx', 'jsxs'))[0] as
			| Record<string, unknown>
			| undefined) ||
		(valenced.react.ReactJSXRuntime as unknown as Record<string, unknown>)
	const registry = globalThis as unknown as Record<string, unknown>

	const onNewElement = (drawn: unknown) => {
		try {
			if (registry[INSTANCE_KEY] !== INSTANCE) return drawn // an older copy of the plugin is still loaded
			const element = drawn as ReactElement<Record<string, unknown>> & Node
			if (!element || !element.props || element.props.__presetsAdded)
				return drawn
			if (isStatusPicker(element)) {
				found.sheet += 1
				if (!setting('inSheet')) return drawn
				return cloneElement(
					element,
					{ __presetsAdded: true } as never,
					[
						...(element.props.children as unknown[]),
						<SheetPresets key="status-presets" />,
					] as never,
				)
			}
			if (isStatusEditor(element)) {
				found.editor += 1
				if (!setting('inEditor')) return drawn
				const kids = element.props.children as unknown[]
				return cloneElement(
					element,
					{ __presetsAdded: true } as never,
					[
						...kids.slice(0, 3),
						<EditorPresets key="status-presets" />,
						...kids.slice(3),
					] as never,
				)
			}
			return drawn
		} catch {
			return drawn
		}
	}
	for (const name of ['jsx', 'jsxs']) {
		if (runtime && typeof runtime[name] === 'function') {
			cleanup(
				after(
					runtime as Record<string, (...args: unknown[]) => unknown>,
					name,
					onNewElement as never,
				),
			)
		}
	}
}
