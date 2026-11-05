import { AssetsRegistry, getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { cloneElement } from 'react'
import { enabled } from './config'
import {
	IDENTITY_PROPS,
	MENU_MAX_ITEMS,
	MENU_MIN_ITEMS,
	PLUS_ICONS,
	PLUS_LABELS,
	PRESS_DEBOUNCE_MS,
	PRESS_PROPS,
} from './constants'
import { findIcon } from './discord'
import { sendAlbumLink, sendInvite, sendSongLink } from './send'
import type { ReactElement } from 'react'
import type { MenuItem, SendOption } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** The three options added to the + menu, in the order they appear. */
const OPTIONS: SendOption[] = [
	{
		setting: 'sendInvite',
		label: 'Send listen along',
		run: () => sendInvite(),
	},
	{
		setting: 'sendSongLink',
		label: 'Send song link',
		run: () => sendSongLink(),
	},
	{
		setting: 'sendAlbumLink',
		label: 'Send playing album',
		run: () => sendAlbumLink(),
	},
]

/** The options the settings leave switched on. */
const wantedOptions = () => OPTIONS.filter(option => enabled(option.setting))

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
			const asset = (
				AssetsRegistry as unknown as {
					getAssetByID(id: number): { name?: string } | undefined
				}
			).getAssetByID(src)
			name = asset?.name || ''
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
 * How well a list of items matches the + menu by its icons: the number of different matching icons, but only if a
 * camera or a poll icon is among them (those two are the surest signs). Otherwise 0.
 */
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

/** How many of the items have one of the given labels. */
function countLabels(list: MenuItem[], labels: Record<string, 1>): number {
	let hits = 0
	for (const item of list) {
		const label = item && typeof item === 'object' && item.label
		if (typeof label === 'string' && labels[label] === 1) hits++
	}
	return hits
}

/**
 * Adds the send options to a menu that is a list of items, if it is the + menu.
 *
 * Discord's menus are data driven: a list of items (label, action, icon) goes in, and the menu draws the rows, tracks
 * which one is pressed and runs the action by its place in the list. So the options are added to that list, before the
 * menu draws anything. The menu is taken for the + menu if two of its labels are the usual ones (Camera, Photos, Poll,
 * Files, Apps) or its icons look like theirs. Each option is a copy of a real item, with its label, action and icon
 * replaced, and with nothing left that identifies the item it came from.
 */
function decorateItems(result: ReactElement, items: MenuItem[]): ReactElement {
	if (!enabled('plusMenu')) return result
	if (countLabels(items, PLUS_LABELS) < 2 && plusScore(items) < 3) return result
	const wanted = wantedOptions()
	if (!wanted.length) return result
	for (const item of items)
		if (item && OPTIONS.some(option => option.label === item.label))
			return result
	const template = items.find(item => item && typeof item.label === 'string')
	if (!template) return result

	const Icon = findIcon(['SpotifyNeutralIcon', 'MusicIcon', 'PlayIcon'])
	const assetId = getAssetIdByName('ic_spotify_white_16px')
	const extra = wanted.map(option => {
		let lastPress = 0
		const press = () => {
			// One tap can reach more than one handler, so only the first one counts.
			if (Date.now() - lastPress < PRESS_DEBOUNCE_MS) return
			lastPress = Date.now()
			try {
				ActionSheetActionCreators.hideAllActionSheets()
			} catch {
				// No sheet was open.
			}
			setTimeout(option.run, 0)
		}
		const item: MenuItem = { ...template, label: option.label }
		// Nothing of the item it was copied from may remain: its action, its icon or its identity.
		for (const name of IDENTITY_PROPS) delete item[name]
		for (const name of PRESS_PROPS) {
			if (name in template || name === 'action') item[name] = press
		}
		if (assetId != null) item.iconSource = assetId
		else delete item.iconSource
		if ('IconComponent' in template || Icon) {
			if (Icon) item.IconComponent = Icon
			else delete item.IconComponent
		}
		return item
	})
	return cloneElement(result, { items: items.concat(extra) } as never)
}

/** Looks at every element Discord creates, and adds the options to the + menu. Anything unexpected returns the element as it was. */
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
 * Patches the JSX runtime so every element Discord creates passes through `decorateMenu`.
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
		if (runtime && typeof runtime[name] === 'function') {
			cleanup(
				after(
					runtime as Record<string, (...args: unknown[]) => unknown>,
					name,
					decorateMenu as never,
				),
			)
		}
	}
}
