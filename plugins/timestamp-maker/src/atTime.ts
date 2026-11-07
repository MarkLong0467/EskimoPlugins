/**
 * `@time`: turns a short word in a message you send into a Discord timestamp.
 *
 * - `@time` is the moment you send it.
 * - `@time(tomorrow 9am)` is a time, written the way the popup understands.
 * - `@time:R` or `@time(in 2h):R` picks a style (`t T d D f F R`). Without one, the style from the settings is used.
 *
 * It happens in Discord's `sendMessage`, so it works for every message you send. Text inside `code` and code blocks is left
 * alone, and a `@time(...)` whose words cannot be read is sent exactly as typed.
 */

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { diag } from './diag'
import { state } from './state'
import { setting } from './store'
import { isStyle, readTime, tag } from './time'
import type { Style } from './time'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** `@time`, then optional `(words)`, then an optional `:style`. Not part of a longer word (`a@time`, `@times`). */
const AT_TIME = /(^|[^\w@<])@time(?:\(([^)\n]*)\))?(?::([tTdDfFR]))?(?!\w)/g

/** Code spans and blocks, which are never changed. */
const CODE = /```[\s\S]*?```|`[^`\n]*`/g

/** What happened to a message. */
export interface Converted {
	text: string
	converted: number
	unreadable: number
}

/**
 * Replaces the `@time` words in a message.
 *
 * @param text The message.
 * @param now The moment to count from.
 * @param fallback The style to use when `@time` has none.
 */
export function convertAtTime(
	text: string,
	now: number,
	fallback: Style = setting('atTimeStyle'),
): Converted {
	let converted = 0
	let unreadable = 0
	const options = {
		zone: setting('zone'),
		order: setting('order'),
		rollForward: setting('rollForward'),
	}
	const convert = (part: string): string =>
		part.replace(
			AT_TIME,
			(whole, before: string, words?: string, style?: string) => {
				const moment =
					words === undefined || words.trim() === ''
						? now
						: readTime(words, now, options)
				if (moment === undefined) {
					unreadable++
					return whole
				}
				converted++
				return `${before}${tag(moment, isStyle(style) ? style : fallback)}`
			},
		)

	let out = ''
	let last = 0
	for (const match of text.matchAll(CODE)) {
		const at = match.index ?? 0
		out += convert(text.slice(last, at)) + match[0]
		last = at + match[0].length
	}
	out += convert(text.slice(last))
	return { text: out, converted, unreadable }
}

/** The module that sends messages (found by its `sendMessage` and `receiveMessage` functions). */
interface MessageActions {
	sendMessage(
		channelId: string,
		message: { content?: unknown; [field: string]: unknown },
		...rest: unknown[]
	): unknown
	receiveMessage: unknown
}

/** Modules that are already patched. */
const patched = new WeakSet<object>()

/**
 * Finds Discord's message module and converts `@time` in what is sent through it.
 *
 * @param cleanup Where to register what undoes it.
 */
export function installAtTime(cleanup: Cleanup): void {
	cleanup(
		getModules(
			withProps<MessageActions>('sendMessage', 'receiveMessage'),
			messages => {
				if (patched.has(messages)) return
				patched.add(messages)
				state.sendModule = true
				cleanup(
					diag.apply('@time in sent messages', () => {
						try {
							const unpatch = instead(
								messages,
								'sendMessage',
								function (args, original) {
									try {
										const message = args[1] as { content?: unknown } | undefined
										if (
											setting('atTime') &&
											typeof message?.content === 'string' &&
											message.content.includes('@time')
										) {
											state.atSeen++
											const done = convertAtTime(message.content, Date.now())
											state.atUnreadable += done.unreadable
											if (done.converted) {
												state.atConverted += done.converted
												state.last = `converted ${done.converted} @time in a message`
												diag.log('@time', state.last)
												return Reflect.apply(original, this, [
													args[0],
													{ ...message, content: done.text },
													...args.slice(2),
												])
											}
										}
									} catch (error) {
										diag.fail('@time', error)
									}
									return Reflect.apply(original, this, args)
								},
							)
							state.sendHook = 'patched'
							return unpatch
						} catch (error) {
							state.sendHook = 'failed'
							throw error
						}
					}),
				)
			},
		),
	)
}
