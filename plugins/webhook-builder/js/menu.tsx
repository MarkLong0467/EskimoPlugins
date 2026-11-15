/**
 * "Webhook Builder" in the menu you get when you hold a message (Discohook's "Restore to Discohook"). It opens a sheet:
 * copy the message into the editor, send a copy with one of your webhooks, copy its JSON, and, for a message one of your
 * webhooks sent, change or delete it.
 *
 * Discord opens that menu as `MessageLongPressActionSheet` with the message in its props. The menu's component is
 * wrapped as it is opened, and the row is added to the box that has the link rows, or to a box of its own.
 */

import { instead } from '@valenced/patcher'
import { cloneElement, createElement, isValidElement } from 'react'
import { Alert } from 'react-native'
import { showActions } from './ActionsSheet'
import { loadSent, send } from './actions'
import {
	deleteMessage,
	describeError,
	fetchChannelMessage,
	messageLink,
} from './api'
import { MENU_LABEL, newId } from './constants'
import { diag, stats } from './diag'
import {
	asset,
	copy,
	iconComponent,
	MENU_ICON,
	MENU_ICON_FALLBACK,
	sheets,
	toast,
} from './discord'
import { draftFrom, exportDraft } from './payload'
import { state, update, webhookById } from './state'
import type { ReactElement, ReactNode } from 'react'
import type { ApiMessage, Draft } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** The key Discord opens the menu of a held message with. */
export const MESSAGE_MENU_KEY = 'MessageLongPressActionSheet'

type Element = ReactElement<Record<string, unknown>>

/** A message as Discord's app keeps it, as far as this plugin uses it. */
interface MessageRecord {
	id?: string
	channel_id?: string
	content?: string
	webhookId?: string | null
	webhook_id?: string | null
	embeds?: unknown[]
	author?: { id?: string; username?: string; avatar?: string | null }
	flags?: number
}

const childrenOf = (node: Element): ReactNode[] => {
	const children = node.props.children as ReactNode
	return Array.isArray(children)
		? children.flat()
		: children == null
			? []
			: [children]
}

const isRow = (node: unknown): node is Element =>
	isValidElement(node) &&
	typeof (node.props as Record<string, unknown>).label === 'string'

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

/** The row, made like one of the menu's own rows. */
function makeRow(template: Element, onPress: () => void): Element {
	const icon = template.props.icon as Element | undefined
	const Icon = iconComponent(MENU_ICON) ?? iconComponent(MENU_ICON_FALLBACK)
	return createElement(template.type as never, {
		...template.props,
		key: 'webhook-builder',
		label: MENU_LABEL,
		arrow: true,
		variant: undefined,
		disabled: false,
		icon: isValidElement(icon)
			? cloneElement(icon as Element, {
					IconComponent: Icon,
					source: Icon
						? undefined
						: (asset(MENU_ICON) ?? asset(MENU_ICON_FALLBACK)),
				})
			: undefined,
		onPress,
	})
}

/** Adds the row to the menu's boxes. Returns `null` when the boxes are not in this element. */
function addToGroups(node: Element, onPress: () => void): Element | null {
	const children = childrenOf(node)
	const groups = children.filter(isGroup)
	if (groups.length === 0) return null
	if (
		groups.some(g =>
			childrenOf(g).some(r => isRow(r) && r.props.label === MENU_LABEL),
		)
	)
		return node
	const linkGroup = groups.find(g =>
		childrenOf(g).some(r => isRow(r) && /Link/.test(iconNameOf(r))),
	)
	const target = linkGroup ?? (groups.at(-1) as Element)
	const row = makeRow(childrenOf(target).find(isRow) as Element, onPress)
	stats.menu = 'added'
	if (linkGroup) {
		const filled = cloneElement(
			linkGroup,
			{} as never,
			...([...childrenOf(linkGroup), row] as never[]),
		)
		return cloneElement(
			node,
			{} as never,
			...(children.map(c => (c === linkGroup ? filled : c)) as never[]),
		)
	}
	const own = createElement(target.type as never, {
		...target.props,
		key: 'webhook-builder-group',
		children: [row],
	})
	return cloneElement(node, {} as never, ...([...children, own] as never[]))
}

/** Finds the boxes of rows in what the menu drew (a few levels down) and adds the row. */
function addRow(node: ReactNode, onPress: () => void, depth = 0): ReactNode {
	if (!isValidElement(node) || depth > 6) return node
	const element = node as Element
	const added = addToGroups(element, onPress)
	if (added) return added
	const children = element.props.children
	if (Array.isArray(children)) {
		const next = children.map(c => addRow(c, onPress, depth + 1))
		return next.some((c, i) => c !== children[i])
			? cloneElement(element, {} as never, ...(next as never[]))
			: element
	}
	const next = addRow(children as ReactNode, onPress, depth + 1)
	return next === children
		? element
		: cloneElement(element, {} as never, next as never)
}

/** The message as Discord's API gives it: read again from Discord, or made from what the app holds. */
async function apiMessage(
	message: MessageRecord,
	channelId: string,
): Promise<ApiMessage> {
	try {
		const fresh = await fetchChannelMessage(channelId, message.id as string)
		if (fresh) return fresh
	} catch (error) {
		diag.log(
			'menu',
			`could not read the message again: ${describeError(error)}`,
			'warn',
		)
	}
	return {
		id: message.id as string,
		channel_id: channelId,
		content: message.content ?? '',
		webhook_id: message.webhookId ?? message.webhook_id ?? undefined,
		author: message.author,
		embeds: (message.embeds ?? []) as ApiMessage['embeds'],
		flags: message.flags,
	}
}

/** Puts a message into the editor. */
function intoEditor(draft: Draft): void {
	update(s => {
		s.draft = draft
		s.target.editing = ''
	})
}

/** Picks one of the saved webhooks, then calls `then` with it. */
function pickWebhook(title: string, then: (id: string) => unknown): void {
	const list = state().webhooks
	if (list.length === 0) {
		toast('Add a webhook in Webhook Builder first')
		return
	}
	showActions(
		title,
		list.map(w => ({
			label: w.label,
			sub: w.name !== w.label ? w.name : undefined,
			run: () => then(w.id),
		})),
	)
}

/** The sheet for a held message. */
export function openMessageSheet(
	message: MessageRecord,
	channelId: string,
	guildId: string | null,
): void {
	const webhookId = message.webhookId ?? message.webhook_id ?? null
	const own = webhookId ? webhookById(webhookId) : undefined
	const load = async () => draftFrom(await apiMessage(message, channelId))

	/** The entry of the list of sent messages for this one, made if it is not there. */
	const sentEntry = () => {
		const known = state().sent.find(x => x.messageId === message.id)
		if (known) return known.id
		const id = newId()
		const thread = channelId !== own?.channelId ? channelId : null
		update(s => {
			s.sent.unshift({
				id,
				webhookId: own?.id as string,
				messageId: message.id as string,
				channelId,
				guildId,
				threadId: thread,
				preview: (message.content ?? '').slice(0, 80) || 'A message',
				at: Date.now(),
			})
		})
		return id
	}

	showActions(MENU_LABEL, [
		{
			label: 'Copy into the editor',
			sub: 'Open Webhook Builder in plugin settings to change and send it',
			run: async () => {
				intoEditor(await load())
				return 'Copied into Webhook Builder'
			},
		},
		...(own
			? [
					{
						label: `Change it (sent by ${own.label})`,
						sub: 'Loads it into the editor; Save changes there edits it',
						run: async () => {
							await loadSent(sentEntry())
							return 'Loaded into Webhook Builder. Open it in plugin settings'
						},
					},
					{
						label: 'Delete it with the webhook',
						danger: true,
						run: () =>
							Alert.alert('Delete this message?', 'This cannot be undone.', [
								{ text: 'Cancel', style: 'cancel' },
								{
									text: 'Delete',
									style: 'destructive',
									onPress: () => {
										const thread =
											channelId !== own.channelId ? channelId : undefined
										deleteMessage(own, message.id as string, thread)
											.then(() => toast('Deleted'))
											.catch(e => toast(describeError(e)))
									},
								},
							]),
					},
				]
			: []),
		{
			label: 'Send a copy with a webhook',
			sub: 'Sends its text and embeds again',
			run: async () => {
				const draft = await load()
				draft.username = ''
				draft.avatarUrl = ''
				pickWebhook('Send a copy with', async id => {
					const [result] = await send(draft, [id])
					return result?.ok
						? `Sent with ${result.webhook.label}`
						: (result?.error ?? 'Not sent')
				})
			},
		},
		{
			label: 'Copy its JSON',
			sub: 'For Discohook or to paste here later',
			run: async () => copy(exportDraft(await load()), 'Copied the JSON'),
		},
		{
			label: 'Copy its link',
			run: () =>
				copy(
					messageLink(guildId, channelId, message.id as string),
					'Copied the link',
				),
		},
	])
}

/** The menu's component with the row added, one per Discord component. */
const wrapped = new WeakMap<object, unknown>()

function wrapMenu(Menu: (props: Record<string, unknown>) => ReactNode) {
	const known = wrapped.get(Menu)
	if (known) return known
	const Wrapped = function WebhookBuilderMenu(props: Record<string, unknown>) {
		const drawn = Menu(props)
		try {
			if (!state().options.menu) return drawn
			const message = props.message as MessageRecord | undefined
			const channel = props.channel as
				| { id?: string; guild_id?: string | null }
				| undefined
			const channelId = channel?.id ?? message?.channel_id
			if (!message?.id || !channelId) return drawn
			return addRow(drawn, () => {
				try {
					sheets().hideAllActionSheets()
				} catch {
					// No sheet was open.
				}
				openMessageSheet(message, channelId, channel?.guild_id ?? null)
			})
		} catch (error) {
			diag.fail('message menu', error)
			return drawn
		}
	}
	wrapped.set(Menu, Wrapped)
	return Wrapped
}

/** Wraps the menu of a held message as it is opened. */
export function installMessageMenu(cleanup: Cleanup): void {
	const creators = sheets() as unknown as {
		openLazy: (...args: unknown[]) => unknown
	}
	if (!creators || typeof creators.openLazy !== 'function') {
		stats.menu = 'no openLazy'
		return
	}
	cleanup(
		instead(creators, 'openLazy', function (args, original) {
			try {
				if (args[1] === MESSAGE_MENU_KEY && state().options.menu) {
					args[0] = Promise.resolve(args[0]).then(module => {
						const loaded = module as { default?: unknown } | undefined
						if (typeof loaded?.default !== 'function') {
							stats.menu = 'menu is not a function'
							return module
						}
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
