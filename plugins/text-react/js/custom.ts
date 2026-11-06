import type { CustomWord } from './types'

/** Most custom words that can be saved. */
export const MAX_CUSTOM_WORDS = 50

const ZWJ = 0x200d
const KEYCAP = 0x20e3

/** Whether a code point continues the emoji before it: joiner, variation selector, skin tone, keycap or tag. */
function continues(code: number): boolean {
	return (
		code === ZWJ ||
		code === KEYCAP ||
		(code >= 0xfe00 && code <= 0xfe0f) ||
		(code >= 0x1f3fb && code <= 0x1f3ff) ||
		(code >= 0xe0020 && code <= 0xe007f)
	)
}

const isRegional = (code: number) => code >= 0x1f1e6 && code <= 0x1f1ff

/**
 * Splits a text into the separate emoji it holds (`🍆🍑` is two). Spaces are dropped.
 *
 * An emoji with a skin tone, a joiner (`👨‍👩‍👧`), a variation selector, a keycap (`1️⃣`) or two regional letters (a flag) is kept in one piece.
 * Text that is not an emoji is split the same way, one character at a time, so it is for the caller to tell it apart.
 */
export function splitEmoji(text: string): string[] {
	const out: string[] = []
	let joined = false
	let regionals = 0
	for (const character of Array.from(text)) {
		const code = character.codePointAt(0) ?? 0
		if (/\s/.test(character)) {
			joined = false
			regionals = 0
			continue
		}
		if (
			out.length &&
			(continues(code) || joined || (isRegional(code) && regionals === 1))
		) {
			out[out.length - 1] += character
			regionals = isRegional(code) ? 2 : 0
			joined = code === ZWJ
			continue
		}
		out.push(character)
		regionals = isRegional(code) ? 1 : 0
		joined = false
	}
	return out
}

/** Whether a piece of text looks like an emoji: its first character is not a letter, digit or plain punctuation. */
export function looksLikeEmoji(piece: string): boolean {
	if (/^[d#*]️?⃣/.test(piece)) return true
	const code = piece.codePointAt(0) ?? 0
	// Latin letters, digits and punctuation end before U+2000. © and ® are symbols that sit inside.
	return code === 0xa9 || code === 0xae || code >= 0x2100
}

/**
 * Cleans a custom word and its emoji as typed in the settings.
 *
 * @returns The entry, or the reason it cannot be used.
 */
export function makeCustomWord(
	wordText: string,
	emojiText: string,
): CustomWord | string {
	const word = wordText.trim().toLowerCase().replace(/\s+/g, ' ')
	if (!word) return 'Type a word'
	const emoji = splitEmoji(emojiText)
	if (!emoji.length) return 'Add at least one emoji'
	if (!emoji.every(looksLikeEmoji)) return 'Only emoji can go there'
	return { word, emoji: emoji.join('') }
}

/** The most emoji one character or word can have in its list. */
export const MAX_LIST_EMOJI = 30

/** A key as written in a list: a space is written as `space` so it can be seen. */
export const keyLabel = (key: string) => (key === ' ' ? 'space' : key)

/** The key a label stands for: `space` is a space. */
export const keyFromLabel = (label: string) => {
	const trimmed = label.trim().toLowerCase()
	return trimmed === 'space' ? ' ' : trimmed
}

/** Lists of emoji as text, one key per line: `a: 🇦 🅰`. This is what is copied, and what can be pasted back. */
export function formatList(lists: Record<string, string[]>): string {
	return Object.keys(lists)
		.map(key => `${keyLabel(key)}: ${lists[key].join(' ')}`)
		.join('\n')
}

/**
 * Reads lists written as `key: emoji emoji` on each line. A line without a colon, with an empty key or with something that
 * is not emoji is skipped and counted.
 */
export function parseList(text: string): {
	lists: Record<string, string[]>
	skipped: number
} {
	const lists: Record<string, string[]> = {}
	let skipped = 0
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim()) continue
		const at = line.indexOf(':', 1)
		const key = at > 0 ? keyFromLabel(line.slice(0, at)) : ''
		const emoji = at > 0 ? splitEmoji(line.slice(at + 1)) : []
		// A key is a character or a word; a space is only the word \`space\`.
		if (
			!key ||
			key.length > 20 ||
			!emoji.length ||
			!emoji.every(looksLikeEmoji)
		) {
			skipped++
			continue
		}
		lists[key] = emoji.slice(0, MAX_LIST_EMOJI)
	}
	return { lists, skipped }
}
