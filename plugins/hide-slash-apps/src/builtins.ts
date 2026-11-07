/** One of Discord's own commands, which have small negative ids and belong to the built-in section. */
export interface BuiltIn {
	/** The command's id, such as `-1`. */
	id: string
	/** The command's name, without the slash. */
	name: string
	/** What it does, in a few words, for the switch's second line. */
	about: string
}

/**
 * The built-in commands in Discord's source (`ApplicationCommandBuiltIns`). Which of them are in the `/` menu depends on the
 * chat (`leave` only in group DMs, `kick` and `ban` only with the right permission), so the settings also list any built-in
 * command Discord returned that is not here, using the name it gave.
 */
export const BUILT_INS: BuiltIn[] = [
	{ id: '-1', name: 'shrug', about: 'Adds ¯\\_(ツ)_/¯ to your message' },
	{ id: '-2', name: 'tableflip', about: 'Adds (╯°□°)╯︵ ┻━┻ to your message' },
	{ id: '-3', name: 'unflip', about: 'Adds ┬─┬ ノ( ゜-゜ノ) to your message' },
	{ id: '-4', name: 'tts', about: 'Sends a text-to-speech message' },
	{ id: '-5', name: 'me', about: 'Makes your message italic, like an action' },
	{ id: '-6', name: 'spoiler', about: 'Hides your message behind a spoiler' },
	{ id: '-7', name: 'nick', about: 'Changes your nickname in a server' },
	{ id: '-10', name: 'thread', about: 'Starts a thread' },
	{ id: '-11', name: 'kick', about: 'Kicks a member' },
	{ id: '-12', name: 'ban', about: 'Bans a member' },
	{ id: '-13', name: 'timeout', about: 'Puts a member in timeout' },
	{ id: '-14', name: 'msg', about: 'Sends a direct message to a member' },
	{ id: '-15', name: 'leave', about: 'Leaves a group DM' },
	{ id: '-18', name: 'roll-dice', about: 'Rolls dice' },
]

/** The words for a built-in command Discord returned that is not in {@link BUILT_INS}. */
export const UNKNOWN_ABOUT = 'One of Discord’s own commands'

/**
 * The built-in commands to show: the known ones, and any other Discord returned, by id order the way Discord numbers them
 * (the known list first, then the extra ones by name).
 *
 * @param seen The built-in commands Discord has returned so far, by id, with their names.
 */
export function builtInsToShow(seen: ReadonlyMap<string, string>): BuiltIn[] {
	const known = new Set(BUILT_INS.map(item => item.id))
	const extra: BuiltIn[] = []
	for (const [id, name] of seen) {
		if (!known.has(id)) extra.push({ id, name, about: UNKNOWN_ABOUT })
	}
	extra.sort((a, b) => a.name.localeCompare(b.name))
	return [...BUILT_INS, ...extra]
}
