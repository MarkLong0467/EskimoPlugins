import { AssetsRegistry } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { cloneElement, createElement } from 'react'
import { setting } from './config'
import {
	COPY_LABELS,
	IDENTITY_PROPS,
	MENU_ICONS,
	MENU_LABEL,
	MESSAGE_ICONS,
	MESSAGE_LABELS,
	PRESS_PROPS,
	SHEET_KEY,
	TARGET_MAX_AGE_MS,
} from './constants'
import { asset, toast } from './discord'
import TextReactSheet from './TextReactSheet'
import type { ReactElement } from 'react'
import type { MenuItem, Target } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** When a box of exactly two rows (Reply and Forward) was last drawn, in milliseconds. */
let pairSeenAt = 0

/** How soon after the Reply and Forward box the box of copy rows is drawn. A menu is drawn in one go. */
const POSITION_WINDOW_MS = 400

/** The message the menu on screen is for, as last noticed. */
let target: Target | null = null

/** Forgets the message. Used when the plugin stops. */
export function forgetTarget(): void {
	target = null
}

/**
 * Notes which message a piece of the menu is about, from its props: a `message` with an id, and the channel it is in (on
 * the message itself, or as `channel` / `channelId` next to it).
 */
function noteTarget(props: Record<string, unknown>): void {
	if (
		typeof props.messageId === 'string' &&
		typeof props.channelId === 'string'
	) {
		target = {
			channelId: props.channelId,
			messageId: props.messageId,
			at: Date.now(),
		}
		return
	}
	const message = props.message as
		| { id?: unknown; channel_id?: unknown; channelId?: unknown }
		| undefined
	if (!message || typeof message !== 'object' || typeof message.id !== 'string')
		return
	const channel = props.channel as { id?: unknown } | undefined
	const channelId = [
		message.channel_id,
		message.channelId,
		channel?.id,
		props.channelId,
	].find(id => typeof id === 'string') as string | undefined
	if (channelId) target = { channelId, messageId: message.id, at: Date.now() }
}

/** The names of icons looked up by asset id, so each id is looked up once. */
const assetNames = new Map<number, string>()

/** The name of an item's icon, from its asset id or its icon component. The same in every language. */
function iconName(item: MenuItem | null | undefined): string {
	if (!item || typeof item !== 'object') return ''
	const src = item.iconSource
	if (typeof src === 'number') {
		const known = assetNames.get(src)
		if (known !== undefined) return known
		let name = ''
		try {
			name =
				(
					AssetsRegistry as unknown as {
						getAssetByID(id: number): { name?: string } | undefined
					}
				).getAssetByID(src)?.name || ''
		} catch {
			// The icon has no name we can read.
		}
		assetNames.set(src, name)
		return name
	}
	const Component = item.IconComponent as
		| { displayName?: string; name?: string }
		| undefined
	return Component?.displayName || Component?.name || ''
}

/**
 * Whether a list of items is the menu you get when you hold a message: two of its labels are the usual ones (Reply, Copy
 * Text, Add Reaction...), or the names of two of its icons look like theirs. The icons make it work in other languages.
 */
function isMessageMenu(items: MenuItem[]): boolean {
	let labels = 0
	const icons = new Set<number>()
	for (const item of items) {
		if (!item || typeof item !== 'object') continue
		if (typeof item.label === 'string' && MESSAGE_LABELS[item.label] === 1)
			labels++
		const name = iconName(item)
		if (name)
			MESSAGE_ICONS.forEach(
				(pattern, index) => pattern.test(name) && icons.add(index),
			)
	}
	return labels >= 2 || icons.size >= 3
}

/** Opens the sheet that asks for the text, for the message the menu was about. */
function openTextReact(message: Target | null): void {
	if (!message) {
		toast(
			'Could not tell which message that was. Hold the message and try again',
		)
		return
	}
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: () => <TextReactSheet target={message} /> }),
		SHEET_KEY,
		{},
	)
}

/**
 * The message the menu that was just drawn is for. It is taken when the menu is drawn, not when a row is tapped, so tapping
 * a while later still reacts to the right message.
 */
function messageForMenu(): Target | null {
	return target && Date.now() - target.at <= TARGET_MAX_AGE_MS
		? { ...target }
		: null
}

/**
 * Adds "Text React" to the menu of a message, which is a list of items (`props.items`).
 *
 * The new item is a copy of the first item that has a label, so it looks like the others, with its label, action and icon
 * replaced and nothing left that identifies the item it came from. It goes at the end. A menu that already has the item,
 * or is not the message menu, is returned as it was. Tapping it closes the menu first.
 */
function decorateItems(result: ReactElement, items: MenuItem[]): ReactElement {
	if (
		!setting('menu') ||
		!isMessageMenu(items) ||
		items.some(item => item && item.label === MENU_LABEL)
	)
		return result
	const template = items.find(item => item && typeof item.label === 'string')
	if (!template) return result

	const item: MenuItem = { ...template, label: MENU_LABEL }
	for (const name of IDENTITY_PROPS) delete item[name]
	const message = messageForMenu()
	let lastPress = 0
	const press = () => {
		// One tap can reach more than one handler, so only the first one counts.
		if (Date.now() - lastPress < 1500) return
		lastPress = Date.now()
		try {
			ActionSheetActionCreators.hideAllActionSheets()
		} catch {
			// No sheet was open.
		}
		setTimeout(() => openTextReact(message), 0)
	}
	for (const name of PRESS_PROPS) {
		if (name in template || name === 'action') item[name] = press
	}
	const icon = MENU_ICONS.map(asset).find(id => id != null)
	if (icon != null) item.iconSource = icon
	else delete item.iconSource
	delete item.IconComponent

	return cloneElement(result, { items: items.concat(item) } as never)
}

/** The name of a React component, from the element that was just made. */
function componentName(element: unknown): string {
	const type = (element as { type?: unknown } | null | undefined)?.type as
		| Record<string, unknown>
		| string
		| undefined
	if (!type || typeof type === 'string') return ''
	const inner = (type.type || type.render || type) as
		| { displayName?: string; name?: string }
		| undefined
	return (
		(type.displayName as string) ||
		(type.name as string) ||
		inner?.displayName ||
		inner?.name ||
		''
	)
}

/** A row of the menu: an element that has a text label. */
type Row = ReactElement<Record<string, unknown>>

/** Whether something is a row of the menu (an element with a text `label`). */
function isRow(value: unknown): value is Row {
	const props = (
		value as { props?: Record<string, unknown> } | null | undefined
	)?.props
	return !!props && typeof props.label === 'string'
}

/** Whether a row is one of the copy rows. It is found by its label or, in other languages, by the name of its icon. */
function isCopyRow(row: Row): boolean {
	if (COPY_LABELS.includes(row.props.label as string)) return true
	const icon = row.props.icon as
		| { props?: Record<string, unknown> }
		| null
		| undefined
	if (!icon || typeof icon !== 'object') return false
	// The row's icon is usually an Icon element that holds the real icon in a prop, so that one is looked at too.
	const inner = [icon.props?.IconComponent, icon.props?.icon, icon.props?.Icon]
	return [icon, ...inner].some(part => {
		if (!part) return false
		const name =
			typeof part === 'function'
				? (part as { displayName?: string; name?: string }).displayName ||
					(part as { name?: string }).name ||
					''
				: componentName(part)
		return /copy|clipboard/i.test(name)
	})
}

/** What is done when the new row is tapped: close the menu, then ask for the text. */
function makePress(message: Target | null): () => void {
	let lastPress = 0
	return () => {
		// One tap can reach more than one handler, so only the first one counts.
		if (Date.now() - lastPress < 1500) return
		lastPress = Date.now()
		try {
			ActionSheetActionCreators.hideAllActionSheets()
		} catch {
			// No sheet was open.
		}
		setTimeout(() => openTextReact(message), 0)
	}
}

/**
 * Adds "Text React" to the menu of a message when it is drawn as groups of rows.
 *
 * The menu has boxes of rows (Reply and Forward; Copy Text, Message, Mention and Copy Message Link; ...). The new row goes
 * at the end of the box that holds the copy rows. It is a copy of one of that box's rows, so it looks the same, with its
 * label, icon and tap action replaced. A box that has no copy row, or has the row already, is left as it is.
 *
 * @param group The element that holds the rows.
 * @returns The same element with the row added, or the element unchanged.
 */
function decorateRows(
	group: ReactElement<Record<string, unknown>>,
): ReactElement {
	if (!setting('menu')) return group
	const children = group.props.children
	const rows = (Array.isArray(children) ? children.flat() : [children]).filter(
		isRow,
	)
	const pressable = rows.every(
		row =>
			typeof row.props.onPress === 'function' ||
			row.props.onPress === undefined,
	)
	if (!pressable || rows.some(row => row.props.label === MENU_LABEL))
		return group

	// The Reply and Forward box comes just before the box of copy rows, in every language. Seeing it makes the next box with
	// three or more rows the copy box, even when its labels and icons cannot be read.
	if (rows.length === 2) pairSeenAt = Date.now()
	const byPosition =
		rows.length >= 3 && Date.now() - pairSeenAt < POSITION_WINDOW_MS
	if (rows.length < 2 || !(rows.some(isCopyRow) || byPosition)) return group
	if (byPosition) pairSeenAt = 0

	const template = (rows.find(isCopyRow) ?? rows[0]) as Row
	const iconId = MENU_ICONS.map(asset).find(id => id != null)
	const row = createElement(template.type as never, {
		...template.props,
		key: 'text-react',
		label: MENU_LABEL,
		subLabel: undefined,
		icon:
			iconId != null
				? createElement(Design.TableRow.Icon, { source: iconId })
				: undefined,
		onPress: makePress(messageForMenu()),
	})
	const kept = Array.isArray(children) ? children.flat() : [children]
	return cloneElement(group, {} as never, [...kept, row] as never)
}

/** Looks at every element Discord creates: notes the message it is about and, in the message menu, adds the item. */
function onNewElement(drawn: unknown): unknown {
	try {
		const element = drawn as
			| ReactElement<{ items?: unknown }>
			| null
			| undefined
		const props = element?.props as Record<string, unknown> | undefined
		if (!element || !props) return drawn
		noteTarget(props)
		if (
			Array.isArray(props.items) &&
			props.items.length >= 2 &&
			props.items.length <= 30
		)
			return decorateItems(element, props.items as MenuItem[])
		// The message menu is drawn as boxes of rows: the box that holds the copy rows gets the new row.
		if (props.children && typeof props.children === 'object')
			return decorateRows(element as ReactElement<Record<string, unknown>>)
		return drawn
	} catch {
		return drawn
	}
}

/**
 * Patches the JSX runtime so every element Discord creates passes through `onNewElement`.
 * The runtime Discord itself uses is found by its functions; the one Valenced provides is the fallback, reached through
 * the unscoped API because a namespace import of 'react/jsx-runtime' would be a read-only copy.
 */
export function installMenuHook(cleanup: Cleanup): void {
	const runtime =
		(lookupModule(withProps('jsx', 'jsxs'))[0] as
			| Record<string, unknown>
			| undefined) ||
		(valenced.react.ReactJSXRuntime as unknown as Record<string, unknown>)
	for (const name of ['jsx', 'jsxs']) {
		if (runtime && typeof runtime[name] === 'function')
			cleanup(
				after(
					runtime as Record<string, (...args: unknown[]) => unknown>,
					name,
					onNewElement as never,
				),
			)
	}
}
