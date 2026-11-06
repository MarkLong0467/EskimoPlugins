/** What the plugin has done since it started, for the settings screen and the report. */
export const state = {
	/** How many copies of Discord's suggested section were patched. */
	patched: 0,
	/** How many times the section was drawn with no suggestions in it. */
	empty: 0,
	/** How many times suggestions were cleared. */
	cleared: 0,
	/** How many channels were in them. */
	channelsCleared: 0,
}

/** Forgets the counts. Used when the plugin stops. */
export function resetState(): void {
	state.patched = 0
	state.empty = 0
	state.cleared = 0
	state.channelsCleared = 0
}
