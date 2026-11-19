/** What the JavaScript half found and did, for the report. */
export const diag = {
	found: {} as Record<string, string>,
	counts: {} as Record<string, number>,
	notes: [] as string[],
}

export function found(what: string, how: string): void {
	diag.found[what] = how
}

export function count(what: string): void {
	diag.counts[what] = (diag.counts[what] ?? 0) + 1
}

export function note(text: string): void {
	if (diag.notes.length < 30) diag.notes.push(text)
}

export function errorText(error: unknown): string {
	return String((error as Error)?.message ?? error).slice(0, 120)
}
