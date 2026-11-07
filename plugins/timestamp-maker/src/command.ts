/**
 * Adds `/timestamp` to Discord's built-in commands.
 *
 * Discord's `ApplicationCommandBuiltIns` module has `getBuiltInCommands(commandTypes, all, textOnly)`. With `all` it returns
 * the whole list; without it, the commands that fit the chat. The wrapper adds one command to what it returns.
 *
 * The command is made like Discord's own `/roll-dice`: a built-in command with an `execute` that opens something and sends
 * nothing. Its kind of input is copied from `/roll-dice` when that is found, and is `0` (`BUILT_IN`) when not.
 */

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { diag } from './diag'
import { state } from './state'
import { setting } from './store'
import { STYLES } from './time'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** Discord's id for the command. Its own built-in commands are `-1` to `-18`; this is far away from those. */
export const COMMAND_ID = '-731001'

/** The id of the section with Discord's built-in commands. */
const BUILT_IN_SECTION = '-1'

/** What the command is run with. */
export interface RunInfo {
	/** The words typed for `when`, if any. */
	when?: string
	/** The style chosen, if any. */
	style?: string
	/** The chat. */
	channelId?: string
}

/** Something with named fields. */
type Bag = Record<string, unknown>
const isBag = (value: unknown): value is Bag =>
	value != null && typeof value === 'object'

/** Reads what `execute` gets: the list of options (`[{ name, value, type }]`) and Discord's context, which has the chat. */
export function readRun(options: unknown, context: unknown): RunInfo {
	const run: RunInfo = {}
	if (Array.isArray(options)) {
		for (const option of options) {
			if (!isBag(option)) continue
			if (option.name === 'when' && typeof option.value === 'string')
				run.when = option.value
			if (option.name === 'style' && typeof option.value === 'string')
				run.style = option.value
		}
	}
	const channel =
		isBag(context) && isBag(context.channel) ? context.channel : undefined
	if (typeof channel?.id === 'string') run.channelId = channel.id
	return run
}

/** The command, made like Discord's built-in ones. */
function makeCommand(inputType: number, run: (info: RunInfo) => void): Bag {
	const description = 'Make a Discord timestamp: pick the date, time and style'
	const option = (name: string, about: string, extra: Bag = {}): Bag => ({
		name,
		displayName: name,
		type: 3,
		description: about,
		displayDescription: about,
		...extra,
	})
	return {
		id: COMMAND_ID,
		untranslatedName: 'timestamp',
		displayName: 'timestamp',
		type: 1,
		inputType,
		applicationId: BUILT_IN_SECTION,
		untranslatedDescription: description,
		displayDescription: description,
		options: [
			option(
				'when',
				'A time such as "tomorrow 9am", "in 2 hours" or "2026-12-25 18:00"',
			),
			option('style', 'The style to start with', {
				choices: STYLES.map(style => ({
					name: style.name,
					displayName: style.name,
					value: style.id,
				})),
			}),
		],
		execute: (options: unknown, context: unknown) => {
			state.commandRuns++
			const info = readRun(options, context)
			const used = [info.when ? 'when' : '', info.style ? 'style' : '']
			state.lastRunOptions = used.filter(Boolean).join(' + ') || 'none'
			try {
				run(info)
			} catch (error) {
				state.last = 'running /timestamp failed'
				diag.fail('run /timestamp', error)
			}
			return undefined
		},
	}
}

/** Whether a list of command types asks for chat commands (type 1). */
const wantsChat = (types: unknown): boolean =>
	Array.isArray(types) && types.includes(1)

/** Discord's module with the built-in commands, as far as this file uses it. */
interface BuiltInApi {
	getBuiltInCommands(
		commandTypes?: unknown,
		all?: unknown,
		textOnly?: unknown,
	): unknown
}

/** Modules that are already patched. */
const patched = new WeakSet<object>()

/**
 * Finds Discord's module with `getBuiltInCommands` and adds the command to its answers.
 *
 * @param cleanup Where to register what undoes it.
 * @param run What to do when `/timestamp` is run.
 */
export function installCommand(
	cleanup: Cleanup,
	run: (info: RunInfo) => void,
): void {
	cleanup(
		getModules(withProps('getBuiltInCommands'), (exports: unknown) => {
			const module = exports as { default?: unknown } | null
			const api = [exports, module?.default].find(
				candidate =>
					isBag(candidate) &&
					typeof candidate.getBuiltInCommands === 'function',
			) as BuiltInApi | undefined
			if (!api || patched.has(api)) return
			patched.add(api)
			state.commandModule = true
			diag.log('found', 'Found the module with getBuiltInCommands')

			let command: Bag | undefined
			// One new list per answer of Discord, so asking twice gives the same list and nothing draws again for no reason.
			const lists = new WeakMap<object, unknown[]>()
			const original = api.getBuiltInCommands

			cleanup(
				diag.apply('/timestamp command', () => {
					try {
						const unpatch = instead(
							api,
							'getBuiltInCommands',
							function (args, call) {
								const result = Reflect.apply(call, this, args)
								try {
									state.listCalls++
									if (!setting('command') || !Array.isArray(result))
										return result
									const all = args[1] === true
									if (!all && (!wantsChat(args[0]) || args[2] === true))
										return result
									if (!command) {
										const everything = original.call(api, [1], true, false)
										const dice = Array.isArray(everything)
											? (everything as Bag[]).find(
													item => item?.untranslatedName === 'roll-dice',
												)
											: undefined
										const inputType =
											typeof dice?.inputType === 'number' ? dice.inputType : 0
										state.kindCopied = typeof dice?.inputType === 'number'
										state.inputType = inputType
										command = makeCommand(inputType, run)
									}
									let list = lists.get(result)
									if (!list) {
										list = result.some(
											item => isBag(item) && item.id === COMMAND_ID,
										)
											? result
											: [...result, command]
										lists.set(result, list)
									}
									state.listWithOurs++
									return list
								} catch (error) {
									diag.fail('built-in commands', error)
									return result
								}
							},
						)
						state.commandHook = 'patched'
						return unpatch
					} catch (error) {
						state.commandHook = 'failed'
						throw error
					}
				}),
			)
		}),
	)
}
