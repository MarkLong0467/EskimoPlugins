/** Cut `text` into pieces of at most `limit` characters, preferring line then word boundaries. */
export function splitMessage(text: string, limit: number): string[] {
	const parts: string[] = []
	let rest = text
	while (rest.length > limit) {
		let cut = rest.lastIndexOf('\n', limit)
		if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit)
		if (cut < limit / 2) cut = limit
		parts.push(rest.slice(0, cut).trimEnd())
		rest = rest.slice(cut).replace(/^[ \n]/, '')
	}
	if (rest.length) parts.push(rest)
	return parts.filter(part => part.length > 0)
}
