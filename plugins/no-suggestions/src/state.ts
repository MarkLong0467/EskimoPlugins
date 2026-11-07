/** What the plugin has done since it started, for the settings screen and the report. */
export const state = {
	/** Whether the hook on the JSX runtime is on, which is how the section is found. */
	jsx: false,
	/** How many times an element of the suggested section was replaced (it is replaced every time Discord draws it). */
	replaced: 0,
	/** How many copies of Discord's suggested section were patched in their module, the other way of finding it. */
	patched: 0,
	/** How many times the section was drawn with no suggestions in it. */
	empty: 0,
	/** How many times suggestions were cleared, and how many channels were in them. */
	cleared: 0,
	channelsCleared: 0,
	/** How many of those went through Discord's own `clearRecentChannels`, and how many through the event alone. */
	clearedByDiscord: 0,
	clearedByEvent: 0,
	/** How many went through Discord's own parts one by one (`bulkClearRecents` and `bulkAck`), and how many channels were marked read. */
	clearedByParts: 0,
	acked: 0,
	/** How Discord's `clearRecentChannels` was found, if it was. */
	how: '',
	/** How many times the section was drawn with channels again after they were cleared, which means the clear did not take. */
	stuck: 0,
}

/** Forgets the counts. Used when the plugin stops. */
export function resetState(): void {
	state.jsx = false
	state.replaced = 0
	state.patched = 0
	state.empty = 0
	state.cleared = 0
	state.channelsCleared = 0
	state.clearedByDiscord = 0
	state.clearedByEvent = 0
	state.clearedByParts = 0
	state.acked = 0
	state.how = ''
	state.stuck = 0
}
