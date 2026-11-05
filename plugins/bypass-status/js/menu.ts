import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { cloneElement, createElement } from 'react'
import {
	IGNORED_SHEET_PARTS,
	MAX_ICONS_SEEN,
	MENU_TARGET_MAX_AGE_MS,
} from './constants'
import { getChannel, isDirectMessage, listEntryForChat } from './discord'
import { isOnList, setOnList } from './list'
import { INSTANCE, INSTANCE_KEY, iconsSeen, menu } from './state'
import { toast } from './toast'
import type { ReactElement } from 'react'
import type { Channel, ListEntry } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** A drawn element that is looked into without knowing its exact kind. */
type Node = ReactElement<Record<string, unknown>> & { type: unknown }

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
		(inner && (inner.displayName || inner.name)) ||
		''
	)
}

/** What to put on the list for a channel, depending on whether it is a chat or a channel of a server. */
function entryForChannel(
	channelId: string,
	channel: Channel | null | undefined,
): ListEntry {
	return isDirectMessage(channel)
		? listEntryForChat(channelId)
		: { kind: 'channels', id: channelId }
}

/**
 * What a piece of a sheet is about: a chat, a channel or a server. A message is not.
 * It looks through the props for an object with an `id` that looks like a channel or a server, or for a string id with a
 * name like `channelId` or `guildId`. A channel wins over a server.
 */
function targetFromProps(
	props: Record<string, unknown> | undefined,
): ListEntry | null {
	if (!props || typeof props !== 'object' || props.message) return null
	let guildTarget: ListEntry | null = null
	for (const [key, value] of Object.entries(props)) {
		const object = value as (Channel & { guildId?: string }) | null
		if (object && typeof object === 'object' && typeof object.id === 'string') {
			const looksLikeChannel =
				key === 'channel' ||
				/channel$/i.test(key) ||
				isDirectMessage(object) ||
				(typeof object.type === 'number' && (object.guild_id || object.guildId))
			if (looksLikeChannel) return entryForChannel(object.id, object)
			if (key === 'guild' || /guild$/i.test(key))
				guildTarget = guildTarget || { kind: 'guilds', id: object.id }
		} else if (typeof value === 'string' && /^\d{15,}$/.test(value)) {
			if (/channel/i.test(key) && getChannel(value))
				return entryForChannel(value, getChannel(value))
			if (/guild/i.test(key))
				guildTarget = guildTarget || { kind: 'guilds', id: value }
		}
	}
	return guildTarget
}

/** Notes what the sheet that was just drawn is about, so a row added later is for the right chat. */
function rememberSheetTarget(element: Node): void {
	const name = componentName(element)
	if (!name || IGNORED_SHEET_PARTS.test(name)) return
	const props = element.props
	if (props?.message) {
		menu.target = null
		return
	}
	const target = targetFromProps(props)
	if (target) menu.target = { ...target, at: Date.now() }
}

/** The name of the icon component of a row. */
const iconNameOf = (row: Node | null | undefined): string => {
	const icon = row?.props?.icon
	return icon && typeof icon === 'object' ? componentName(icon) : ''
}

/** Whether a row is the Mute row. It is found by its icon, so this works in any language. */
function isMuteRow(row: unknown): boolean {
	const node = row as Node | null | undefined
	if (!node || typeof node !== 'object' || !node.props) return false
	if (
		/mute|bell.*(slash|off)|notification.*(off|slash)/i.test(iconNameOf(node))
	)
		return true
	const label = node.props.label
	return typeof label === 'string' && /^(un)?mute\b/i.test(label.trim())
}

/** Remembers the icon of a row in a sheet that has no Mute row, for the report. */
function rememberIcon(row: Node): void {
	const name = iconNameOf(row)
	if (name && iconsSeen.length < MAX_ICONS_SEEN && !iconsSeen.includes(name))
		iconsSeen.push(name)
}

/**
 * Adds a "Bypass Do Not Disturb" row to the group of rows that holds Mute. Everything else is returned untouched.
 *
 * A group is a short list (at most 4) of rows with a Mute row in it, and the sheet's subject must have been noted in the
 * last few seconds. The new row is a copy of the Mute row, so it looks the same. Tapping it closes the sheet and puts the
 * chat, channel or server on the list, or takes it off.
 */
function addBypassRow(group: Node): Node {
	const props = group?.props
	if (!props || props.__bypassRowAdded || !props.children) return group
	const rows = (
		Array.isArray(props.children) ? props.children : [props.children]
	).filter((row: unknown) => row && typeof row === 'object') as Node[]
	if (!rows.length || rows.length > 4) return group

	const muteRow = rows.find(isMuteRow)
	if (!muteRow) {
		for (const row of rows) rememberIcon(row)
		return group
	}
	if (!menu.target || Date.now() - menu.target.at > MENU_TARGET_MAX_AGE_MS)
		return group

	const { kind, id } = menu.target
	const chosen = isOnList(kind, id)
	const bypassRow = createElement(muteRow.type as never, {
		...muteRow.props,
		key: 'bypass-dnd',
		label: chosen ? 'Stop bypassing Do Not Disturb' : 'Bypass Do Not Disturb',
		icon: createElement(
			Design.Text,
			{ variant: 'text-md/bold' },
			chosen ? '🔕' : '🔔',
		),
		subLabel: undefined,
		onPress: () => {
			try {
				ActionSheetActionCreators.hideAllActionSheets()
			} catch {
				// No sheet was open.
			}
			setTimeout(() => {
				setOnList(kind, id, !chosen)
				toast(
					chosen
						? 'No longer bypassing Do Not Disturb'
						: 'You will be notified in Do Not Disturb',
				)
			}, 0)
		},
	})
	return cloneElement(group, { __bypassRowAdded: true } as never, [
		...rows,
		bypassRow,
	]) as Node
}

/**
 * Patches the JSX runtime, so every sheet Discord draws passes through here: its subject is noted and, where it is a
 * chat's menu, the row is added. A copy of the plugin that was replaced leaves menus alone.
 */
export function hookMenus(cleanup: Cleanup): void {
	// The runtime Discord itself uses is found by its functions; the one Valenced provides is the fallback. It is reached
	// through the unscoped API because a namespace import of 'react/jsx-runtime' would be a read-only copy.
	const runtime =
		(lookupModule(withProps('jsx', 'jsxs'))[0] as
			| Record<string, unknown>
			| undefined) ||
		(valenced.react.ReactJSXRuntime as unknown as Record<string, unknown>)
	const registry = globalThis as unknown as Record<string, unknown>

	const onNewElement = (element: unknown) => {
		if (registry[INSTANCE_KEY] !== INSTANCE) return element // an older copy of the plugin is still loaded
		rememberSheetTarget(element as Node)
		return addBypassRow(element as Node)
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
