import React from 'react'
import { onImportedPath, safeInstead } from '../modules'
import { getSettings } from '../state'
import type { ReactNode } from 'react'

interface UnicodeEmojis {
	default: {
		findInlineEmojisFromSurrogates(
			text: string,
		): Array<
			{ type: 'text'; text: string } | { type: 'emoji'; surrogate: string }
		>
	}
}

export function stripChannelEmojis(
	name: string,
	emojis: UnicodeEmojis['default'],
): string {
	const parts = emojis.findInlineEmojisFromSurrogates(name)
	if (!parts.some(part => part.type === 'emoji')) return name
	const text = parts
		.map(part => (part.type === 'text' ? part.text : ''))
		.join('')
	return (
		text
			.replace(
				/^[\s\u30fb\u00b7\u2022|\u2502\u2503-]+|[\s\u30fb\u00b7\u2022|\u2502\u2503-]+$/g,
				'',
			)
			.trim() || name
	)
}

function replaceName(
	node: ReactNode,
	name: string,
	replacement: string,
): ReactNode {
	if (typeof node === 'string') return node === name ? replacement : node
	if (Array.isArray(node))
		return node.map(child => replaceName(child, name, replacement))
	if (!React.isValidElement<{ children?: ReactNode }>(node)) return node
	const children = node.props.children
	if (children === undefined) return node
	const next = replaceName(children, name, replacement)
	return next === children ? node : React.cloneElement(node, { children: next })
}

export function patchChannelNameEmojis(): () => void {
	const unpatch: Array<() => void> = []

	unpatch.push(
		onImportedPath<UnicodeEmojis>(
			'modules/emojis/UnicodeEmojis.tsx',
			emojis => {
				const transform = function (
					this: unknown,
					args: unknown[],
					original: (...args: unknown[]) => ReactNode,
				) {
					const result = Reflect.apply(original, this, args)
					const props = args[0] as { name?: string; channel?: { name: string } }
					const name = props.channel?.name ?? props.name
					if (!getSettings().channelNameEmojis || typeof name !== 'string')
						return result
					const text = stripChannelEmojis(name, emojis.default)
					return text === name ? result : replaceName(result, name, text)
				}
				unpatch.push(
					onImportedPath<{
						BaseChannelName: (...args: unknown[]) => ReactNode
					}>('modules/guild_sidebar/native/BaseChannelItem.tsx', ns => {
						unpatch.push(safeInstead(ns, 'BaseChannelName', transform))
					}),
					onImportedPath<{
						default: { type: (...args: unknown[]) => ReactNode }
					}>('modules/channel_list_v2/native/items/TextChannel.tsx', ns => {
						unpatch.push(safeInstead(ns.default, 'type', transform))
					}),
					onImportedPath<{
						CategoryChannel: (...args: unknown[]) => ReactNode
					}>(
						'modules/channel_list_v2/native/items/RedesignCategory.tsx',
						ns => {
							unpatch.push(safeInstead(ns, 'CategoryChannel', transform))
						},
					),
				)
			},
		),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}
