import { splitEmoji } from './custom'
import { MULTIPLE, SINGLE } from './emoji-table'
import type { EmojiTable } from './emoji-table'
import type { CustomWord, EmojiResult } from './types'

/** Whether a character is part of a word (a letter or a digit). */
const isWordCharacter = (character: string | undefined) =>
	!!character && /[\p{L}\p{N}]/u.test(character)

/** Letters that have no accent to take off but still stand for a plain letter. */
const LOOK_ALIKES: Record<string, string> = {
	ß: 's',
	ø: 'o',
	æ: 'a',
	œ: 'o',
	ł: 'l',
	đ: 'd',
	ð: 'd',
	þ: 't',
	ı: 'i',
}

/**
 * The text without accents, with every character kept as one character (so `é` is `e`, `ñ` is `n`, `ß` is `s`), so both texts
 * can be read with the same positions. Characters that are not letters with an accent are left as they are.
 */
export function plain(text: string): string {
	let out = ''
	for (const character of Array.from(text)) {
		const mapped = LOOK_ALIKES[character]
		if (mapped) {
			out += mapped
			continue
		}
		const base = character.normalize('NFD')[0] ?? character
		// Only letters are folded: a base that is a different kind of character (a symbol, a digit) is not what was typed.
		out += /\p{L}/u.test(character) && /\p{L}/u.test(base) ? base : character
	}
	return out
}

/** A copy of a table, so the emoji used for one text are not gone for the next. */
function fresh(table: EmojiTable): Record<string, string[]> {
	const copy: Record<string, string[]> = {}
	for (const key of Object.keys(table)) copy[key] = table[key].slice()
	return copy
}

/** The keys of the whole-word table, longest first, so `100` is tried before `10` and `abc` before `ab`. */
const WORDS = Object.keys(MULTIPLE).sort((a, b) => b.length - a.length)

/** What the person changed: their own mappings, and the built-in ones they turned off. */
export interface EmojiOptions {
	custom?: CustomWord[]
	/** Keys of built-in mappings (a character or a word) that are not used. */
	hidden?: string[]
}

/**
 * Turns a text into emoji that can be added as reactions.
 *
 * The text is read from the front. At each place these are tried, in this order:
 * 1. the person's own mappings, longest first. A mapping of one character applies wherever the character is; a mapping of a
 *    longer word only applies to the whole word (not inside another word). It gives all its emoji that are not used yet,
 * 2. the built-in words and runs (`ok`, `cool`, `100`, `!!`...), longest first,
 * 3. the built-in emoji of the single character (a letter, digit, space or some punctuation).
 * A built-in mapping that the person turned off, or replaced with their own, is skipped. Each emoji can only be used once on
 * a message, so when one is used up the next choice for the same character is used: the first `a` is the regional
 * indicator letter and the second is the red square one, and a third has none. A character with no emoji, or with all its
 * emoji used, is left out and the result is marked `incomplete`. Capital letters are the same as small ones, and so are letters
 * with an accent (`é` is `e`), unless the person made a mapping for the accented letter itself.
 *
 * @param input The text.
 * @returns The emoji in order, and whether the text was not fully turned into emoji.
 */
export function generateEmojiArray(
	input: string,
	options: EmojiOptions = {},
): EmojiResult {
	const hidden = new Set((options.hidden ?? []).map(key => key.toLowerCase()))
	const custom = new Map<string, string[]>()
	for (const entry of options.custom ?? []) {
		const key = entry.word.toLowerCase().normalize('NFC')
		if (key) custom.set(key, splitEmoji(entry.emoji))
	}
	const customKeys = [...custom.keys()].sort((a, b) => b.length - a.length)

	const words = fresh(MULTIPLE)
	const singles = fresh(SINGLE)
	const used = new Set<string>()
	const emoji: string[] = []
	let incomplete = false
	let exact = input.toLowerCase().normalize('NFC')
	let folded = plain(exact)
	let before: string | undefined

	/** Takes the next unused emoji of a pool. */
	const take = (pool: string[]): string | undefined => {
		while (pool.length) {
			const next = pool.shift() as string
			if (!used.has(next)) return next
		}
		return undefined
	}
	const add = (value: string) => {
		used.add(value)
		emoji.push(value)
	}
	const advance = (length: number) => {
		before = exact[length - 1]
		exact = exact.slice(length)
		folded = folded.slice(length)
	}

	/** Whether a mapping of the person applies here. A key without accents also matches accented letters. */
	const applies = (key: string): boolean => {
		const plainKey = plain(key)
		if (plainKey === key ? !folded.startsWith(key) : !exact.startsWith(key))
			return false
		if (key.length === 1) return true
		return !isWordCharacter(before) && !isWordCharacter(exact[key.length])
	}

	while (exact.length > 0) {
		const own = customKeys.find(applies)
		if (own) {
			const unused = (custom.get(own) as string[]).filter(
				value => !used.has(value),
			)
			if (unused.length) for (const value of unused) add(value)
			else incomplete = true
			advance(own.length)
			continue
		}
		const word = WORDS.find(
			key =>
				folded.startsWith(key) &&
				!hidden.has(key) &&
				!custom.has(key) &&
				words[key].length > 0,
		)
		if (word) {
			const next = take(words[word])
			if (next) {
				add(next)
				advance(word.length)
				continue
			}
		}
		const character = folded[0]
		const choices = singles[character]
		const next =
			choices && !hidden.has(character) && !custom.has(character)
				? take(choices)
				: undefined
		if (next) add(next)
		else incomplete = true
		advance(1)
	}
	return { emoji, incomplete }
}
