/**
 * Adds `/silence` to Discord's built-in commands.
 *
 * `/silence user:@someone` silences that person, or stops silencing them if they already are. The option is Discord's own user
 * picker, so the value that arrives is the person's id.
 *
 * Discord's `ApplicationCommandBuiltIns` module has `getBuiltInCommands(commandTypes, all, textOnly)`. The wrapper adds one
 * command to what it returns. The command is made like Discord's own `/roll-dice`: a built-in command with an `execute` that
 * does something and sends nothing itself. Its kind of input is copied from `/roll-dice` when that is found.
 */

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { diag } from './diag'
import { state } from './state'
import { setting } from './store'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** Discord's id for the command. Its own built-in commands are `-1` to `-18`; this is far away from those. */
export const COMMAND_ID = '-731003'

/** The id of the section with Discord's built-in commands. */
const BUILT_IN_SECTION = '-1'

/** The option kind for "a user" in a command. */
const USER_OPTION = 6

/** What the command is run with. */
export interface RunInfo {
	/** The id of the person picked. */
	userId?: string
}

/** Something with named fields. */
type Bag = Record<string, unknown>
const isBag = (value: unknown): value is Bag =>
	value != null && typeof value === 'object'

/** Reads what `execute` gets: the list of options (`[{ name, value, type }]`). */
export function readRun(options: unknown): RunInfo {
	const run: RunInfo = {}
	if (Array.isArray(options)) {
		for (const option of options) {
			if (isBag(option) && option.name === 'user' && option.value != null)
				run.userId = String(option.value)
		}
	}
	return run
}

/** The command, made like Discord's built-in ones. */
function makeCommand(inputType: number, run: (info: RunInfo) => void): Bag {
	const description =
		'Silence the pings of a person, or let them ping you again'
	const about = 'The person to silence or to let ping you again'
	return {
		id: COMMAND_ID,
		untranslatedName: 'silence',
		displayName: 'silence',
		type: 1,
		inputType,
		applicationId: BUILT_IN_SECTION,
		untranslatedDescription: description,
		displayDescription: description,
		options: [
			{
				name: 'user',
				displayName: 'user',
				type: USER_OPTION,
				required: true,
				description: about,
				displayDescription: about,
			},
		],
		execute: (options: unknown) => {
			state.commandRuns++
			try {
				run(readRun(options))
			} catch (error) {
				state.last = 'running /silence failed'
				diag.fail('run /silence', error)
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
 * @param run What to do when `/silence` is run.
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
				diag.apply('/silence command', () => {
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
										command = makeCommand(
											typeof dice?.inputType === 'number' ? dice.inputType : 0,
											run,
										)
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
						state.commandHook = 'registered'
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
