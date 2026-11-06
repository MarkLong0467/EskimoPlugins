import { AssetsRegistry } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { cloneElement } from 'react'
import { setting } from './config'
import {
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
function openTextReact(): void {
	if (!target || Date.now() - target.at > TARGET_MAX_AGE_MS) {
		toast(
			'Could not tell which message that was. Hold the message and try again',
		)
		return
	}
	const message = target
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: () => <TextReactSheet target={message} /> }),
		SHEET_KEY,
		{},
	)
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
		setTimeout(openTextReact, 0)
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
