/**
 * The names in chat. Discord's chat is drawn by native code from one object of data per message (a "row"), which
 * `RowManager.generate` makes. This runs right after it and changes the colours in that data: the author's name, the name on
 * the reply line above a message, and mentions. Nothing of Discord is replaced, and the patch is taken off when the plugin
 * stops.
 */

import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { processColor } from 'react-native'
import {
	MENTION_LIGHTNESS,
	MENTION_SATURATION,
	pastel,
	toHex,
	toNative,
	toRgbInt,
} from './color'
import { store } from './config'
import { diag } from './diag'
import { countOf } from './state'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** The data of one message in a row, as far as this plugin reads and changes it. */
interface RowMessage {
	authorId?: unknown
	username?: unknown
	content?: unknown
	roleColor?: unknown
	roleColors?: unknown
	usernameColor?: unknown
	colorString?: unknown
	shouldShowRoleOnName?: boolean
	shouldShowRoleDot?: boolean
	referencedMessage?: { message?: RowMessage | null } | null
}

/** Discord's message, as far as this plugin reads it. */
interface MessageRecord {
	webhookId?: unknown
	colorString?: unknown
}

/** A piece of a message's text. A mention is one, and pieces can have pieces inside them. */
interface ContentNode {
	type?: unknown
	userId?: unknown
	colorString?: unknown
	roleColor?: unknown
	color?: unknown
	content?: unknown
}

/** Colours the mentions of people who have no role colour, in a message's text. */
function paintMentions(nodes: unknown[]): void {
	for (const item of nodes) {
		const node = item as ContentNode | null
		if (!node || typeof node !== 'object') continue
		if (node.type === 'mention' && node.userId != null) {
			const mentions = countOf('mentions')
			mentions.seen++
			if (node.colorString != null) continue
			const color = pastel(
				String(node.userId),
				MENTION_SATURATION,
				MENTION_LIGHTNESS,
			)
			node.roleColor = toRgbInt(color)
			node.color = toRgbInt(color)
			node.colorString = toHex(color)
			mentions.changed++
		} else if (Array.isArray(node.content)) paintMentions(node.content)
	}
}

/**
 * Colours the name on one message. A name that has a role colour keeps it unless the user asked for everyone; a webhook's
 * colour comes from the name it posts under, or from its ID.
 *
 * @returns Whether the name was coloured.
 */
function paint(data: RowMessage, record: MessageRecord | undefined): boolean {
	if (store.get('mentions') && Array.isArray(data.content))
		paintMentions(data.content)
	let key: unknown
	if (record?.webhookId != null)
		key = store.get('webhookName') ? data.username : record.webhookId
	else if (store.get('everyone') || !(record?.colorString ?? data.roleColor))
		key = data.authorId
	if (key == null || key === '') return false
	const color = toNative(pastel(String(key)), processColor)
	data.roleColor = color
	data.usernameColor = color
	data.colorString = color
	// A role with a gradient would be drawn over the one colour.
	if (data.roleColors != null) data.roleColors = null
	// The colour goes on the name, also for people who have role colours shown as a dot.
	data.shouldShowRoleOnName = true
	if (data.shouldShowRoleDot) data.shouldShowRoleDot = false
	return true
}

/** Changes the colours in a row that Discord just made. */
function recolour(input: unknown, row: unknown): void {
	const data = (row as { message?: RowMessage | null } | null)?.message
	if (!data || typeof data !== 'object' || data.authorId == null) return
	const names = countOf('names')
	names.seen++
	const record = (input as { message?: MessageRecord } | null)?.message
	if (paint(data, record)) names.changed++
	const reply = data.referencedMessage?.message
	if (reply && typeof reply === 'object' && reply.authorId != null)
		paint(reply, undefined)
}

/** The classes that are patched already, so one that is found twice is patched once. */
const patched = new WeakSet<object>()

/** Patches `generate` of a module that has Discord's `RowManager`. */
function patchManager(module: unknown, cleanup: Cleanup): void {
	const found = module as { default?: unknown } | null
	const manager = typeof found?.default === 'function' ? found.default : found
	const proto = (manager as { prototype?: Record<string, unknown> } | null)
		?.prototype
	if (!proto || typeof proto.generate !== 'function' || patched.has(proto))
		return
	patched.add(proto)
	let failed = false
	cleanup(
		() => patched.delete(proto),
		instead(
			proto as Record<string, (...args: unknown[]) => unknown>,
			'generate',
			function (args, original) {
				const row = Reflect.apply(original, this, args)
				try {
					recolour(args[0], row)
				} catch (error) {
					// One report is enough: a chat has hundreds of rows.
					if (!failed) diag.fail('rows', error)
					failed = true
				}
				return row
			},
		),
	)
	diag.log('rows', 'RowManager.generate patched')
}

/** Starts colouring the names in chat. */
export function installRows(cleanup: Cleanup): void {
	// Both lines are in the report and the settings even when nothing is found, as 0 of 0.
	countOf('names')
	countOf('mentions')
	cleanup(
		diag.apply('rows: RowManager', () =>
			getModules(
				withName('RowManager'),
				module => patchManager(module, cleanup),
				{ returnNamespace: true },
			),
		),
	)
}
