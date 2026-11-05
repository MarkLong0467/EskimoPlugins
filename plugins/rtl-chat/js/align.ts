import { instead } from '@valenced/patcher'
import { NativeModules } from 'react-native'
import { BLOCKS, LRE, MESSAGE_ROW, PDF, RLM } from './constants'
import { hooked, textAligned } from './state'
import type { ChatRow, Inline } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/*
 * Right-aligned message text.
 *
 * Discord draws messages natively and lines text up from the language of the text. Starting each paragraph with an
 * invisible right-to-left mark makes it a right-to-left paragraph, so it lines up on the right. The words themselves are
 * put inside a left-to-right embedding, so English keeps its order and its full stops stay at the end of the sentence.
 */

/** Text with each new line given the marks too, so every line is a right-to-left paragraph. */
const markText = (text: unknown): string =>
	String(text).replace(/\n/g, `${PDF}\n${RLM}${LRE}`)

/** One line of inline pieces (text, links, emoji, mentions), wrapped so that it is a right-to-left paragraph. */
function alignInline(nodes: Inline[]): Inline[] {
	const out: Inline[] = [{ type: 'text', content: RLM + LRE }]
	for (const node of nodes) {
		if (node && node.type === 'text' && typeof node.content === 'string')
			out.push(Object.assign({}, node, { content: markText(node.content) }))
		else out.push(node)
	}
	out.push({ type: 'text', content: PDF })
	return out
}

/** A message's content (plain text, or parsed pieces) with the marks added. Anything unexpected is returned as it was. */
function alignContent(content: unknown): unknown {
	if (typeof content === 'string') return RLM + LRE + markText(content) + PDF
	if (!Array.isArray(content) || !content.length) return content
	const list = content as Inline[]
	const hasBlocks = list.some(
		n => n && BLOCKS[n.type as string] && Array.isArray(n.content),
	)
	if (!hasBlocks) return alignInline(list)
	return list.map(n =>
		n && BLOCKS[n.type as string] && Array.isArray(n.content)
			? Object.assign({}, n, { content: alignInline(n.content as Inline[]) })
			: n,
	)
}

/**
 * Rewrites the rows Discord hands to its native chat (as JSON text) so message text lines up on the right.
 * If the style does not align text, or anything is unexpected, the rows go through untouched.
 */
function alignRows(json: unknown): unknown {
	if (typeof json !== 'string' || !textAligned()) return json
	const rows = JSON.parse(json) as ChatRow[]
	if (!Array.isArray(rows)) return json
	let touched = 0
	for (const row of rows) {
		if (!row || row.type !== MESSAGE_ROW || !row.message) continue
		hooked.seen++
		const before = row.message.content
		if (before === undefined || before === null) continue
		row.message.content = alignContent(before)
		touched++
		hooked.changed++
	}
	return touched ? JSON.stringify(rows) : json
}

/** Patches the native chat's `updateRows`, so every list of rows passes through `alignRows` on its way in. */
export function installRowAlignment(cleanup: Cleanup): void {
	let chat: { updateRows?: unknown } | undefined
	try {
		chat = (
			NativeModules as unknown as { DCDChatManager?: { updateRows?: unknown } }
		).DCDChatManager
	} catch {
		// The native chat is not there.
	}
	if (!chat || typeof chat.updateRows !== 'function') {
		hooked.rows = 'chat module not found'
		return
	}
	cleanup(
		instead(
			chat as { updateRows: (...args: unknown[]) => unknown },
			'updateRows',
			function (args, original) {
				let next = args
				try {
					const json = alignRows(args[1])
					if (json !== args[1]) next = [args[0], json, ...args.slice(2)]
				} catch {
					next = args
				}
				return Reflect.apply(original, this, next)
			},
		),
	)
	hooked.rows = 'hooked'
}
