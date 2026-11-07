/**
 * The long press on an app's picture in the `/` menu.
 *
 * Discord draws the `/` menu from a few components that are found by their names while they are drawn (see `jsxFind.ts`):
 * - `CategoryItem`: one app's picture in the rail at the bottom of the menu. A memo of a function that returns a pressable.
 * - `ApplicationSectionHeader`: the small bar with an app's picture and name above its commands.
 * - `ApplicationCommandItem`: one command row.
 *
 * For each, the plugin gives React a stand-in that runs Discord's own component and then changes what it drew: the rail
 * picture gets `onLongPress`, the header is wrapped in a pressable that has it. As a second way of hiding (if Discord changes
 * its hooks), a stand-in whose app is hidden draws nothing, after Discord's own component has run so its hooks still run.
 */

import { cloneElement, isValidElement, useSyncExternalStore } from 'react'
import { Pressable } from 'react-native'
import { installJsxFinder } from '../../../shared/palmdevs/jsxFind'
import { diag } from './diag'
import { openHideSheet } from './sheet'
import { state } from './state'
import { getRevision, isHidden, onRevision } from './store'
import type { ComponentType, ReactElement } from 'react'
import type { AppInfo } from './store'

/** Registers functions to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** A function component, as far as the stand-ins call it. */
type Render = (props: Record<string, unknown>, ref?: unknown) => unknown

/** How long a press has to last, in milliseconds, to count as a long press. */
const LONG_PRESS_MS = 350

/** The ids of Discord's own sections, which are not apps. A real app's id is a long number. */
const isAppId = (id: unknown): id is string =>
	typeof id === 'string' && /^\d{5,}$/.test(id)

/** The app of a section as the menu knows it, or nothing if the section is not an app. */
function appOf(section: unknown): AppInfo | undefined {
	if (!section || typeof section !== 'object') return undefined
	const s = section as { id?: unknown; name?: unknown; icon?: unknown }
	if (!isAppId(s.id)) return undefined
	return {
		id: s.id,
		name: typeof s.name === 'string' && s.name ? s.name : 'this app',
		icon: typeof s.icon === 'string' && s.icon ? s.icon : undefined,
	}
}

/** The server a section was drawn for, or nothing in a DM. */
const guildOf = (value: unknown): string | undefined =>
	typeof value === 'string' && value ? value : undefined

/** The function inside a component: the function itself, or what a `React.memo` or `forwardRef` wraps. */
function innerOf(type: unknown): Render | undefined {
	if (typeof type === 'function') return type as Render
	if (type && typeof type === 'object') {
		const wrapped = type as { type?: unknown; render?: unknown }
		if (typeof wrapped.type === 'function') return wrapped.type as Render
		if (typeof wrapped.render === 'function') return wrapped.render as Render
	}
	return undefined
}

/** Handles a long press: opens the sheet, or notes why it could not. */
function pressed(section: unknown, guildId: unknown): void {
	state.longPresses++
	const app = appOf(section)
	if (!app) {
		state.lastPress = 'the press was on something that is not an app'
		diag.log('press', state.lastPress, 'warn')
		return
	}
	openHideSheet(app, guildOf(guildId))
}

/** Makes the component draw again when the lists of hidden apps change. Called on every draw, so the hooks never change. */
function useRevision(): void {
	useSyncExternalStore(onRevision, getRevision)
}

/**
 * Makes a stand-in for one of Discord's components, always the same one for the same original (React starts a new component
 * if it is given a different one each draw).
 *
 * @param made The stand-ins made so far.
 * @param type Discord's component, as it was given to `jsx`.
 * @param draw What the stand-in draws, given Discord's own drawing, its props, and whether its app is hidden.
 */
function standIn(
	made: WeakMap<object, ComponentType<Record<string, unknown>>>,
	type: unknown,
	draw: (drawn: unknown, props: Record<string, unknown>) => unknown,
): ComponentType<Record<string, unknown>> | undefined {
	if (!type || (typeof type !== 'function' && typeof type !== 'object'))
		return undefined
	const known = made.get(type as object)
	if (known) return known
	const inner = innerOf(type)
	if (!inner) return undefined
	const Wrapped = (props: Record<string, unknown>) => {
		useRevision()
		const drawn = inner(props, null)
		try {
			return draw(drawn, props)
		} catch (error) {
			diag.fail('stand-in', error)
			return drawn
		}
	}
	made.set(type as object, Wrapped as ComponentType<Record<string, unknown>>)
	return Wrapped as ComponentType<Record<string, unknown>>
}

/** The stand-ins, one list for each of Discord's components. */
const rails = new WeakMap<object, ComponentType<Record<string, unknown>>>()
const headers = new WeakMap<object, ComponentType<Record<string, unknown>>>()
const rows = new WeakMap<object, ComponentType<Record<string, unknown>>>()

/** Gives a rail picture the long press, or draws nothing if its app is hidden. */
function drawRail(drawn: unknown, props: Record<string, unknown>): unknown {
	const section = props.section as { id?: unknown } | undefined
	if (isHidden(section?.id, guildOf(props.guildId))) {
		state.componentHid++
		return null
	}
	if (!isValidElement(drawn)) return drawn
	state.railMenu++
	return cloneElement(drawn as ReactElement<Record<string, unknown>>, {
		onLongPress: () => pressed(props.section, props.guildId),
		delayLongPress: LONG_PRESS_MS,
	})
}

/** Wraps a header in something that hears the long press, or draws nothing if its app is hidden. */
function drawHeader(drawn: unknown, props: Record<string, unknown>): unknown {
	const section = props.section as { id?: unknown } | undefined
	if (isHidden(section?.id, guildOf(props.guildId))) {
		state.componentHid++
		return null
	}
	if (!isAppId(section?.id)) return drawn
	state.headerMenu++
	return (
		<Pressable
			onLongPress={() => pressed(props.section, props.guildId)}
			delayLongPress={LONG_PRESS_MS}
		>
			{drawn as ReactElement}
		</Pressable>
	)
}

/** Draws nothing for a command of a hidden app (the second way). */
function drawRow(drawn: unknown, props: Record<string, unknown>): unknown {
	const command = props.command as { applicationId?: unknown } | undefined
	if (isHidden(command?.applicationId, guildOf(props.guildId))) {
		state.componentHid++
		return null
	}
	return drawn
}

/**
 * Watches the JSX runtime for the components of the `/` menu and swaps in the stand-ins.
 *
 * @param cleanup Where to register what stops it.
 */
export function installMenu(cleanup: Cleanup): void {
	state.jsx = installJsxFinder(cleanup, [
		{
			name: 'CategoryItem',
			seen: () => {
				state.railSeen++
				diag.log('found', 'The app icons of the rail were drawn')
			},
			replace: type => standIn(rails, type, drawRail),
		},
		{
			name: 'ApplicationSectionHeader',
			seen: () => {
				state.headerSeen++
				diag.log('found', 'An app header was drawn')
			},
			replace: type => standIn(headers, type, drawHeader),
		},
		{
			name: 'ApplicationCommandItem',
			seen: () => {
				state.rowSeen++
				diag.log('found', 'A command row was drawn')
			},
			replace: type => standIn(rows, type, drawRow),
		},
	])
	if (!state.jsx) diag.log('jsx', 'The JSX runtime was not found', 'warn')
}
