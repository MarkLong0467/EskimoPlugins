import { cloneElement } from 'react'
import { DEBOUNCE_MS, ID_LABEL, IDENTITY_PROPS, PRESS_PROPS } from './constants'
import { isOurs, OPTIONS, runOption } from './options'
import { state } from './state'
import { findInTree } from './tree'
import type { ReactElement } from 'react'
import type { Node, SheetItem } from './types'

/** Whether something is a menu item (or a row's props) with the label of Discord's "Copy Role ID". */
function isIdLabel(value: unknown): boolean {
	const item = value as SheetItem | null | undefined
	return !!item && typeof item === 'object' && item.label === ID_LABEL
}

/**
 * Remembers which role a menu or role chip is about, from the props Discord gives it (a `roleId`, or a `role` object,
 * and the server it is in). It is the fallback when Discord's own copy action gives no id.
 */
function noteProps(props: Record<string, unknown>): void {
	const role = props.role as { id?: unknown; guild_id?: unknown } | undefined
	const id =
		typeof props.roleId === 'string'
			? props.roleId
			: role && typeof role.id === 'string'
				? role.id
				: undefined
	if (!id) return

	state.seen.roleId = id
	state.seen.guildId =
		(props.guildId as string | undefined) ||
		(role && (role.guild_id as string | undefined)) ||
		state.seen.guildId
	state.seen.at = Date.now()
}

/** Adds the options to a menu that is a list of items (`props.items`), under "Copy Role ID". */
function decorateItems(
	result: ReactElement,
	props: { items: SheetItem[] },
): ReactElement {
	const items = props.items
	const at = items.findIndex(isIdLabel)
	if (at === -1 || items.some(item => item && isOurs(item.label))) return result

	// The new items are copies of "Copy Role ID", so they look the same and behave like menu items of this menu.
	const template = items[at]
	const press = PRESS_PROPS.find(name => typeof template[name] === 'function')
	if (!press) return result
	const base = template[press] as () => unknown

	const made = OPTIONS.map(option => {
		const item: SheetItem = { ...template, label: option.label }
		for (const name of IDENTITY_PROPS) delete item[name]
		for (const name of PRESS_PROPS) {
			if (name in template) item[name] = () => runOption(option, base)
		}
		return item
	})

	if (Date.now() - state.addedAt < DEBOUNCE_MS) return result
	state.addedAt = Date.now()

	const next = items.slice()
	next.splice(at + 1, 0, ...made)
	return cloneElement(result, { items: next } as never)
}

/** Adds the options to a menu that is drawn as rows (`props.children`), under the "Copy Role ID" row. */
function decorateRows(result: ReactElement, children: unknown[]): ReactElement {
	const row = children.findIndex(child => {
		const element = child as Node | null | undefined
		return element?.props && isIdLabel(element.props)
	})
	if (row === -1 || Date.now() - state.addedAt < DEBOUNCE_MS) return result
	if (
		findInTree(children, (node: Node) => node.props && isOurs(node.props.label))
	)
		return result

	state.addedAt = Date.now()
	const source = children[row] as ReactElement<{ onPress?: unknown }>
	const base = source.props.onPress
	if (typeof base !== 'function') return result

	children.splice(
		row + 1,
		0,
		...OPTIONS.map((option, index) =>
			cloneElement(source, {
				key: `role-option-${index}`,
				label: option.label,
				onPress: () => runOption(option, base as () => unknown),
			} as never),
		),
	)
	return result
}

/**
 * Adds "Copy Role Name", "Copy Role Color" and "Copy Role Icon" under "Copy Role ID" in the role menu.
 *
 * It runs after every element Discord creates (`jsx` and `jsxs`) and acts only on the role menu: an element that has
 * a `Copy Role ID` item, either in a list of items or as a row. Everything else is returned unchanged, and anything
 * that goes wrong also returns the element unchanged.
 *
 * Discord draws a menu more than once, so the options are added at most once every `DEBOUNCE_MS` and never to a menu
 * that already has them.
 *
 * @param result The element Discord created.
 * @returns The element, with the options added where this is the role menu.
 */
export function decorateSheet(result: unknown): unknown {
	try {
		const element = result as ReactElement | null | undefined
		const props = element?.props as Record<string, unknown> | undefined
		if (!element || !props) return result

		noteProps(props)

		if (Array.isArray(props.items))
			return decorateItems(element, props as { items: SheetItem[] })
		if (!Array.isArray(props.children)) return result
		return decorateRows(element, props.children)
	} catch {
		return result
	}
}
