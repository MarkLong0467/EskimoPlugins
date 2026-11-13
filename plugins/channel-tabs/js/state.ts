/** How often one part of Discord was seen and how often it was changed, for the report. */
export interface Count {
	seen: number
	changed: number
}

/** What the plugin did since it started. */
export const counts: Record<string, Count> = {}

/** The counter of one part of Discord. */
export function countOf(name: string): Count {
	counts[name] ??= { seen: 0, changed: 0 }
	return counts[name]
}

/** What was last measured on the screen (the size of each half, which chats Discord drew), for the report. */
export const facts: Record<string, string> = {}

/** Keeps the latest value of something that was measured. */
export function note(name: string, value: string): void {
	facts[name] = value
}

/** Forgets what happened. Used when the plugin stops. */
export function resetState(): void {
	for (const name of Object.keys(counts)) delete counts[name]
	for (const name of Object.keys(facts)) delete facts[name]
}
