/**
 * Hide icons: a collapsed folder shows the folder icon instead of small pictures of the servers inside.
 *
 * Discord's `GuildsBarGuildFolder` draws the folder through a `TransitionGroup` whose `items` are one of:
 * - `[{ type: 'icon', tintStyle }]` when the folder is open: the folder icon, tinted with the folder's colour,
 * - `[{ type: 'preview', guilds, selectedGuildId }]` when it is closed: the small server pictures.
 *
 * The component is found by its name while it is drawn (see `jsxFind.ts`). The plugin gives React a stand-in that runs Discord's
 * own component, and when the folder is closed and the switch is on, swaps the `preview` item for the `icon` item. The `icon`
 * item has the same key as the open folder's, so opening and closing still animates.
 */

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { cloneElement, isValidElement, useSyncExternalStore } from 'react'
import { installJsxFinder } from '../../../shared/palmdevs/jsxFind'
import { diag } from './diag'
import { state } from './state'
import { getVersion, isOn, onChange } from './store'
import type { ComponentType, ReactElement } from 'react'

type Cleanup = (...fns: Array<() => unknown>) => unknown
type Bag = Record<string, unknown>
type Render = (props: Bag, ref?: unknown) => unknown

const isBag = (value: unknown): value is Bag =>
	value != null && typeof value === 'object'

/** The names of an object's fields, with the kind of each, for the report. */
function shape(value: unknown): string {
	if (!isBag(value)) return String(value)
	return Object.entries(value)
		.slice(0, 24)
		.map(
			([key, item]) =>
				`${key}:${Array.isArray(item) ? `array(${item.length})` : typeof item}`,
		)
		.join(', ')
}

/** Discord's function for a folder's colour, when found. */
let normalizeColor: ((color: unknown) => unknown) | undefined

/** The tint style for the folder icon: the folder's colour as `#rrggbb`, or nothing to leave the icon as it is. */
function tintFor(color: unknown): Bag {
	let value: unknown = color
	try {
		if (normalizeColor) value = normalizeColor(color)
	} catch (error) {
		diag.fail('folder colour', error)
	}
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
		? { tintColor: `#${(value >>> 0).toString(16).padStart(6, '0')}` }
		: {}
}

/** The function inside a component: the function itself, or what a `React.memo` or `forwardRef` wraps. */
function innerOf(type: unknown): Render | undefined {
	if (typeof type === 'function') return type as Render
	if (isBag(type)) {
		if (typeof type.type === 'function') return type.type as Render
		if (typeof type.render === 'function') return type.render as Render
	}
	return undefined
}

/** Makes the folder draw again when a switch changes. Called on every draw, so the hooks never change. */
function useChanges(): void {
	useSyncExternalStore(onChange, getVersion)
}

/**
 * Swaps the closed folder's server pictures for the folder icon in what Discord drew.
 *
 * @param drawn What Discord's folder drew.
 * @param props The folder's props.
 * @returns The same element when there is nothing to change.
 */
function swapPreview(drawn: unknown, props: Bag): unknown {
	if (!isValidElement(drawn)) return drawn
	const element = drawn as ReactElement<Bag>
	const group = element.props?.children
	if (!isValidElement(group)) {
		state.unexpected++
		return drawn
	}
	const groupElement = group as ReactElement<Bag>
	const items = groupElement.props?.items
	if (!state.folderShape) state.folderShape = shape(element.props)
	if (!state.itemsShape && Array.isArray(items))
		state.itemsShape = items.map(item => shape(item)).join(' | ')
	if (!Array.isArray(items)) {
		state.unexpected++
		return drawn
	}
	if (!items.some(item => isBag(item) && item.type === 'preview')) return drawn
	state.iconsHidden++
	const icon = { type: 'icon', tintStyle: tintFor(props.color) }
	return cloneElement(element, {
		children: cloneElement(groupElement, { items: [icon] }),
	})
}

/** Stand-ins, one for each of Discord's folder components. */
const standIns = new WeakMap<object, ComponentType<Bag>>()

function standIn(type: unknown): ComponentType<Bag> | undefined {
	if (!isBag(type) && typeof type !== 'function') return undefined
	const known = standIns.get(type as object)
	if (known) return known
	const inner = innerOf(type)
	if (!inner) return undefined
	const Wrapped = (props: Bag) => {
		useChanges()
		const drawn = inner(props, null)
		try {
			if (props.expanded) return drawn
			state.collapsedDrawn++
			if (!isOn('hideIcons')) return drawn
			return swapPreview(drawn, props)
		} catch (error) {
			diag.fail('folder icons', error)
			return drawn
		}
	}
	standIns.set(type as object, Wrapped as ComponentType<Bag>)
	return Wrapped as ComponentType<Bag>
}

/**
 * Watches the JSX runtime for Discord's folder and swaps in the stand-in.
 *
 * @param cleanup Where to register what stops it.
 */
export function installIcons(cleanup: Cleanup): void {
	state.jsx = installJsxFinder(cleanup, [
		{
			name: 'GuildsBarGuildFolder',
			seen: () => {
				state.folderSeen++
				diag.log('found', 'A folder was drawn')
			},
			replace: standIn,
		},
	])
	if (!state.jsx) diag.log('jsx', 'The JSX runtime was not found', 'warn')
	cleanup(
		getModules(withProps('normalizeFolderColor'), (exports: unknown) => {
			const found = exports as { normalizeFolderColor?: unknown } | null
			if (typeof found?.normalizeFolderColor === 'function') {
				normalizeColor = found.normalizeFolderColor as (
					color: unknown,
				) => unknown
				state.colourModule = true
				diag.log('found', 'Found the module that works out folder colours')
			}
		}),
		() => {
			normalizeColor = undefined
		},
	)
}
