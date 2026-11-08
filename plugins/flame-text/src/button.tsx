/**
 * The Flame Typing row in the chat box's + menu (the one with Camera, Photos, Poll and so on). Tapping it switches flame text on
 * or off, and the row says which it is now.
 *
 * Discord's menus are data driven: a list of items (label, action, icon) goes in and the menu draws the rows. So the row is
 * added to that list before the menu draws anything, the same way the Spotify Tools plugin adds its rows. The JSX runtime is
 * watched for a menu with the usual + menu rows; the new row is a copy of a real row, with its label, action and icon
 * replaced and nothing left that identifies the row it came from.
 */

import { AssetsRegistry } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { cloneElement } from 'react'
import { diag } from './diag'
import { currentChat, plainOnly } from './send'
import { state } from './state'
import { setting } from './store'
import { switchFlame } from './toggle'
import type { ReactElement } from 'react'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** One item of a menu that is a list of items. Discord adds more fields than are listed. */
interface MenuItem {
	label?: string
	iconSource?: unknown
	IconComponent?: unknown
	[field: string]: unknown
}

/** The row's words. The first part is the same in every state, so the row is found again. */
export const ROW_LABEL = 'Flame Typing'
export const rowText = (on: boolean, barred = false): string =>
	`${ROW_LABEL}: ${barred ? NOT_HERE : on ? 'On' : 'Off'}`

/** Shown instead of On or Off in the chat where flame text is not allowed. */
const NOT_HERE = '\u{1F6AB}'

/** Labels of the rows of the + menu. A menu with two of them is taken for the + menu. */
const PLUS_LABELS: Record<string, 1> = {
	Camera: 1,
	Photos: 1,
	Poll: 1,
	Files: 1,
	Apps: 1,
}
/** What the + menu's icons are called: a camera, a picture, a poll, a paperclip, an app. */
const PLUS_ICONS = [
	/camera/i,
	/image|photo|picture|gallery/i,
	/poll/i,
	/paperclip|attach|file|document/i,
	/\bapps?\b|sparkle|robot|bot/i,
]
/** The names Discord's menu items use for what happens when they are tapped. */
const PRESS_PROPS = [
	'action',
	'onPress',
	'onSelect',
	'onClick',
	'callback',
	'handler',
] as const
/** Fields that identify one particular menu item. They are dropped when an item is copied. */
const IDENTITY_PROPS = [
	'id',
	'key',
	'testID',
	'nativeID',
	'index',
	'state',
] as const
const MENU_MIN_ITEMS = 2
const MENU_MAX_ITEMS = 24
/** One tap can reach more than one handler, so only the first one in this time counts. */
const PRESS_DEBOUNCE_MS = 600

/** Icon names looked up by asset id, so each id is looked up once. */
const assetNames = new Map<number, string>()

/** The name of an icon, from its asset id or its icon component. The same in every language. */
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

/** How well a list of items matches the + menu by its icons. Only counts when a camera or a poll icon is among them. */
function plusScore(items: MenuItem[]): number {
	const found: Record<number, boolean> = {}
	let strong = false
	for (const item of items) {
		const name = iconName(item)
		if (!name) continue
		PLUS_ICONS.forEach((pattern, index) => {
			if (pattern.test(name)) {
				found[index] = true
				if (index === 0 || index === 2) strong = true
			}
		})
	}
	return strong ? Object.keys(found).length : 0
}

/** How many of the items have one of the labels of the + menu. */
function plusLabels(items: MenuItem[]): number {
	let hits = 0
	for (const item of items) {
		const label = item && typeof item === 'object' && item.label
		if (typeof label === 'string' && PLUS_LABELS[label] === 1) hits++
	}
	return hits
}

/** Whether a list of items is the + menu. */
export function isPlusMenu(items: MenuItem[]): boolean {
	return plusLabels(items) >= 2 || plusScore(items) >= 3
}

/** An icon for the row: a flame if Discord has one, otherwise something close. */
function icon(): unknown {
	for (const name of ['FireIcon', 'ActivityIcon', 'StarIcon'])
		try {
			const found = lookupGeneratedIconComponent(name)
			if (found) return found
		} catch {
			// Try the next one.
		}
	return undefined
}

/** Adds the Flame Typing row to a menu that is a list of items, if it is the + menu. */
function decorateItems(result: ReactElement, items: MenuItem[]): ReactElement {
	if (!setting('button') || !isPlusMenu(items)) return result
	state.actionsSeen = true
	const template = items.find(item => item && typeof item.label === 'string')
	if (!template) return result
	const rest = items.filter(
		item =>
			!(
				item &&
				typeof item.label === 'string' &&
				item.label.startsWith(ROW_LABEL)
			),
	)

	const barred = plainOnly(currentChat())
	let lastPress = 0
	const press = () => {
		if (Date.now() - lastPress < PRESS_DEBOUNCE_MS) return
		lastPress = Date.now()
		// In the chat where flame text is not allowed the row only closes the menu.
		if (!barred) {
			try {
				state.buttonTaps++
				switchFlame()
			} catch (error) {
				diag.fail('flame row', error)
			}
		}
		try {
			ActionSheetActionCreators.hideAllActionSheets()
		} catch {
			// No sheet was open.
		}
	}
	const row: MenuItem = { ...template, label: rowText(setting('on'), barred) }
	for (const name of IDENTITY_PROPS) delete row[name]
	for (const name of PRESS_PROPS) {
		if (name in template || name === 'action') row[name] = press
	}
	const Icon = icon()
	delete row.iconSource
	if ('IconComponent' in template || Icon) {
		if (Icon) row.IconComponent = Icon
		else delete row.IconComponent
	}
	state.buttonDrawn++
	return cloneElement(result, { items: rest.concat(row) } as never)
}

/** Looks at every element Discord creates, and adds the row to the + menu. Anything unexpected returns the element as it was. */
function decorateMenu(result: unknown): unknown {
	try {
		const element = result as
			| ReactElement<{ items?: unknown }>
			| null
			| undefined
		const props = element?.props
		if (!element || !props) return result
		const items = props.items
		if (
			Array.isArray(items) &&
			items.length >= MENU_MIN_ITEMS &&
			items.length <= MENU_MAX_ITEMS
		)
			return decorateItems(element, items as MenuItem[])
		return result
	} catch {
		return result
	}
}

/**
 * Patches the JSX runtime so every element Discord creates passes through `decorateMenu`. The runtime Discord itself uses is
 * found by its functions; the one Valenced provides is the fallback.
 *
 * @param cleanup Where to register what undoes it.
 */
export function installButton(cleanup: Cleanup): void {
	try {
		const runtime =
			(lookupModule(withProps('jsx', 'jsxs'))[0] as
				| Record<string, unknown>
				| undefined) ||
			(valenced.react.ReactJSXRuntime as unknown as Record<string, unknown>)
		for (const name of ['jsx', 'jsxs']) {
			if (runtime && typeof runtime[name] === 'function') {
				cleanup(
					after(
						runtime as Record<string, (...args: unknown[]) => unknown>,
						name,
						decorateMenu as never,
					),
				)
				state.jsx = true
			}
		}
		diag.log('found', 'Watching for the + menu')
	} catch (error) {
		diag.fail('watch for the + menu', error)
	}
}
