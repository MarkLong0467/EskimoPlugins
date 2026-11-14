/**
 * Adds "Search Image" to the two menus of a picture, as Equicord adds it to its two context menus:
 * - Equicord's message menu (right click on a picture in a message) is the menu you get when you hold a picture in chat.
 *   Discord opens it as `MessageLongPressActionSheet` with the picture that was held as `selectedMedia`.
 * - Equicord's image menu (right click on a picture elsewhere) is the menu of Discord's picture viewer, whose rows are
 *   made by `useMediaShareActions`.
 */

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { cloneElement, createElement, isValidElement } from 'react'
import { diag, stats } from './diag'
import { asset, iconComponent, SEARCH_ICON, sheets } from './discord'
import { MENU_LABEL, openEngineSheet } from './EngineSheet'
import type { ComponentType, ReactElement, ReactNode } from 'react'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** The key Discord opens the menu of a held message with. */
export const MESSAGE_MENU_KEY = 'MessageLongPressActionSheet'

/** The picture that was held, as Discord gives it to the menu. */
interface SelectedMedia {
	mediaType?: string
	mediaUrl?: string
}

/** A row of the viewer's menu, as `useMediaShareActions` makes it. */
interface ShareItem {
	IconComponent?: unknown
	label?: string
	action?: () => void
}

/** What the picture viewer knows about the picture on screen. */
interface ViewerSource {
	sourceURI?: string
	uri?: string
	videoURI?: string
}

type Element = ReactElement<Record<string, unknown>>

/** The children of an element, as a list. */
const childrenOf = (node: Element): ReactNode[] => {
	const children = node.props.children as ReactNode
	return Array.isArray(children)
		? children.flat()
		: children == null
			? []
			: [children]
}

/** Whether something is a row: an element with a text label. */
const isRow = (node: unknown): node is Element =>
	isValidElement(node) &&
	typeof (node.props as Record<string, unknown>).label === 'string'

/** Whether something is a box of rows (`ActionSheetRow.Group`): it has `hasIcons` and rows. */
const isGroup = (node: unknown): node is Element =>
	isValidElement(node) &&
	'hasIcons' in (node.props as Record<string, unknown>) &&
	childrenOf(node as Element).some(isRow)

/** The name of a row's icon component (`LinkIcon`), the same in every language. */
function iconNameOf(row: Element): string {
	const icon = row.props.icon as Element | undefined
	const component = (
		isValidElement(icon) ? icon.props.IconComponent : undefined
	) as { displayName?: string; name?: string } | undefined
	return component?.displayName || component?.name || ''
}

/** The "Search Image" row, made like one of the menu's own rows. */
function makeRow(template: Element, src: string): Element {
	const icon = template.props.icon as Element | undefined
	const Search = iconComponent(SEARCH_ICON)
	return createElement(template.type as never, {
		...template.props,
		key: 'search-image',
		label: MENU_LABEL,
		arrow: true,
		variant: undefined,
		disabled: false,
		icon: isValidElement(icon)
			? cloneElement(icon as Element, {
					IconComponent: Search,
					source: Search ? undefined : asset(SEARCH_ICON),
				})
			: undefined,
		onPress: () => {
			diag.log('menu', 'Search Image chosen in the message menu')
			openEngineSheet(src)
		},
	})
}

/**
 * Adds the row to the menu's boxes: at the end of the box with the link rows (Equicord's "copy-link" group), or in a box
 * of its own at the end when there is none. Returns `null` when the boxes are not in this element.
 */
function addToGroups(node: Element, src: string): Element | null {
	const children = childrenOf(node)
	const groups = children.filter(isGroup)
	if (groups.length === 0) return null
	if (
		groups.some(group =>
			childrenOf(group).some(
				row => isRow(row) && row.props.label === MENU_LABEL,
			),
		)
	)
		return node
	const linkGroup = groups.find(group =>
		childrenOf(group).some(row => isRow(row) && /Link/.test(iconNameOf(row))),
	)
	const target = linkGroup ?? (groups.at(-1) as Element)
	const template = childrenOf(target).find(isRow) as Element
	const row = makeRow(template, src)
	stats.added++
	if (linkGroup) {
		const filled = cloneElement(
			linkGroup,
			{} as never,
			...([...childrenOf(linkGroup), row] as never[]),
		)
		return cloneElement(
			node,
			{} as never,
			...(children.map(child =>
				child === linkGroup ? filled : child,
			) as never[]),
		)
	}
	const own = createElement(target.type as never, {
		...target.props,
		key: 'search-image-group',
		children: [row],
	})
	return cloneElement(node, {} as never, ...([...children, own] as never[]))
}

/** Finds the boxes of rows in what the menu drew (a few levels down) and adds the row. */
function addRow(node: ReactNode, src: string, depth = 0): ReactNode {
	if (!isValidElement(node) || depth > 6) return node
	const element = node as Element
	const added = addToGroups(element, src)
	if (added) return added
	const children = element.props.children
	if (Array.isArray(children)) {
		const next = children.map(child => addRow(child, src, depth + 1))
		return next.some((child, index) => child !== children[index])
			? cloneElement(element, {} as never, ...(next as never[]))
			: element
	}
	const next = addRow(children as ReactNode, src, depth + 1)
	return next === children
		? element
		: cloneElement(element, {} as never, next as never)
}

/** The menu's component with the row added, one per Discord component. */
const wrapped = new WeakMap<object, ComponentType<Record<string, unknown>>>()

function wrapMenu(Menu: (props: Record<string, unknown>) => ReactNode) {
	const known = wrapped.get(Menu)
	if (known) return known
	const Wrapped = function SearchImageMenu(props: Record<string, unknown>) {
		const drawn = Menu(props)
		try {
			const media = props.selectedMedia as SelectedMedia | null | undefined
			// Equicord's `reverseImageSearchType === "img"`: only for a picture.
			if (media?.mediaType !== 'image' || typeof media.mediaUrl !== 'string')
				return drawn
			return addRow(drawn, media.mediaUrl)
		} catch (error) {
			diag.fail('message menu', error)
			return drawn
		}
	}
	wrapped.set(Menu, Wrapped as never)
	return Wrapped as never
}

/** Wraps the menu of a held message as it is opened, so the menu that is drawn has the row. */
export function installMessageMenu(cleanup: Cleanup): void {
	const creators = sheets() as unknown as {
		openLazy: (...args: unknown[]) => unknown
	}
	if (!creators || typeof creators.openLazy !== 'function') {
		stats.messageMenu = 'no openLazy'
		return
	}
	cleanup(
		instead(creators, 'openLazy', function (args, original) {
			try {
				const media = (args[2] as { selectedMedia?: SelectedMedia } | undefined)
					?.selectedMedia
				if (args[1] === MESSAGE_MENU_KEY && media?.mediaType === 'image') {
					args[0] = Promise.resolve(args[0]).then(module => {
						const loaded = module as { default?: unknown } | undefined
						if (typeof loaded?.default !== 'function') {
							stats.messageMenu = 'menu is not a function'
							return module
						}
						stats.messageMenu = 'working'
						return { ...loaded, default: wrapMenu(loaded.default as never) }
					})
				}
			} catch (error) {
				diag.fail('message menu', error)
			}
			return Reflect.apply(original, this, args)
		}),
	)
}

/** Adds "Search Image" to the rows of the picture viewer's menu, for a picture (not a video). */
export function installViewerMenu(cleanup: Cleanup): void {
	cleanup(
		getModules(withProps('useMediaShareActions'), module => {
			const target = module as
				| { useMediaShareActions?: unknown }
				| null
				| undefined
			if (!target || typeof target.useMediaShareActions !== 'function') return
			stats.viewerMenu = 'found'
			cleanup(
				instead(
					target as { useMediaShareActions: (...args: unknown[]) => unknown },
					'useMediaShareActions',
					function (args, original) {
						const result = Reflect.apply(original, this, args)
						try {
							if (!Array.isArray(result)) return result
							const source = (args[0] as { source?: ViewerSource } | undefined)
								?.source
							const src = source?.sourceURI ?? source?.uri
							if (!source || source.videoURI != null || typeof src !== 'string')
								return result
							const items = result as ShareItem[]
							if (items.some(item => item?.label === MENU_LABEL)) return result
							stats.viewerMenu = 'working'
							stats.added++
							return [
								...items,
								{
									IconComponent:
										iconComponent(SEARCH_ICON) ??
										items.find(item => item?.IconComponent)?.IconComponent,
									label: MENU_LABEL,
									action: () => {
										diag.log('menu', 'Search Image chosen in the viewer')
										openEngineSheet(src)
									},
								},
							]
						} catch (error) {
							diag.fail('viewer menu', error)
							return result
						}
					},
				),
			)
		}),
	)
}
