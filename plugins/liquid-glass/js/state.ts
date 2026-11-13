/** How often one part of Discord was seen and how often it was frosted, for the report. */
export interface Count {
	seen: number
	frosted: number
}

/** What the plugin did since it started. */
export const counts: Record<string, Count> = {}

/** The counter of one part of Discord. */
export function countOf(name: string): Count {
	counts[name] ??= { seen: 0, frosted: 0 }
	return counts[name]
}

/** Forgets what happened. Used when the plugin stops. */
export function resetState(): void {
	for (const name of Object.keys(counts)) delete counts[name]
}
