/**
 * Cuts `text` into pieces of at most `limit` characters.
 *
 * Where to cut, in order of preference:
 * 1. the last line break before the limit,
 * 2. the last space before the limit,
 * 3. the limit itself, in the middle of a word.
 *
 * A break point is only used if it falls in the second half of the piece. Otherwise the piece would be very short
 * and the next steps are tried instead.
 *
 * The line break or space the text was cut at is dropped, and trailing spaces are trimmed, so joining the pieces
 * with that separator gives the original text back.
 *
 * @param text The text to split.
 * @param limit The most characters a single piece may have.
 * @returns The pieces, in order. Empty pieces are left out.
 */
export function splitMessage(text: string, limit: number): string[] {
	const parts: string[] = []
	let rest = text

	while (rest.length > limit) {
		let cut = rest.lastIndexOf('\n', limit)
		if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit)
		if (cut < limit / 2) cut = limit

		parts.push(rest.slice(0, cut).trimEnd())
		// Drop the single separator the text was cut at.
		rest = rest.slice(cut).replace(/^[ \n]/, '')
	}

	if (rest.length) parts.push(rest)
	return parts.filter(part => part.length > 0)
}
