/** What the plugin did since it started, for the settings screen and the report. */
export const state = {
	/** Whether Discord's own `setGuildOptIn` was found. */
	actionFound: false,
	/** Whether the plugin is watching for joins, which it does once Discord has loaded your servers. */
	armed: false,
	/** How many join events it saw, and how many servers it dealt with. */
	joins: 0,
	turnedOn: 0,
	alreadyOn: 0,
	skipped: 0,
	failed: 0,
}

/** Forgets what happened. Used when the plugin stops. */
export function resetState(): void {
	state.actionFound = false
	state.armed = false
	state.joins = 0
	state.turnedOn = 0
	state.alreadyOn = 0
	state.skipped = 0
	state.failed = 0
}
