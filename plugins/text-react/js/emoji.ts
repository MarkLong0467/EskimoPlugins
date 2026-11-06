import { MULTIPLE, SINGLE } from './emoji-table'
import type { EmojiTable } from './emoji-table'
import type { EmojiResult } from './types'

/** A copy of a table, so the emoji used for one text are not gone for the next. */
function fresh(table: EmojiTable): Record<string, string[]> {
	const copy: Record<string, string[]> = {}
	for (const key of Object.keys(table)) copy[key] = table[key].slice()
	return copy
}

/** The keys of the whole-word table, longest first, so `100` is tried before `10` and `abc` before `ab`. */
const WORDS = Object.keys(MULTIPLE).sort((a, b) => b.length - a.length)

/**
 * Turns a text into emoji that can be added as reactions.
 *
 * The text is read from the front. At each place a whole word or run that has an emoji of its own (`ok`, `cool`, `100`,
 * `!!`...) is tried first, longest first, and then a single character (a letter, digit, space or some punctuation). Each
 * emoji can only be used once on a message, so when one is used up the next choice for the same character is used:
 * the first `a` is the regional indicator letter and the second is the red square one, and a third has none.
 * A character with no emoji, or with all its emoji used, is left out and the result is marked `incomplete`.
 * Capital letters are the same as small ones.
 *
 * @param input The text.
 * @returns The emoji in order, and whether the text was not fully turned into emoji.
 */
export function generateEmojiArray(input: string): EmojiResult {
	const words = fresh(MULTIPLE)
	const singles = fresh(SINGLE)
	const emoji: string[] = []
	let incomplete = false
	let rest = input.toLowerCase()

	while (rest.length > 0) {
		const word = WORDS.find(
			key => rest.startsWith(key) && words[key].length > 0,
		)
		if (word) {
			emoji.push(words[word].shift() as string)
			rest = rest.slice(word.length)
			continue
		}
		const character = rest[0]
		const choices = singles[character]
		if (choices && choices.length > 0) emoji.push(choices.shift() as string)
		else incomplete = true
		rest = rest.slice(1)
	}
	return { emoji, incomplete }
}
