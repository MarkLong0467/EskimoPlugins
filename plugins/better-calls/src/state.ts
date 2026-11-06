/** What was found and patched, and what the plugin did, for the settings screen and the report. */
export const state = {
	/** The DM header was seen being drawn, and the hook that replaces it is on. */
	buttons: false,
	jsxButtons: false,
	/** The ring request is being watched (Discord's HTTP object was found and patched). */
	ring: false,
	/** How many HTTP objects have their `post` watched (Discord's module and the `HTTP` object inside it, at least). */
	httpPatched: 0,
	/** How many requests about calls (other than the ring) were seen. */
	callRequests: 0,
	/** The speaker button of the voice panel was seen being drawn, and the hook that replaces it is on. */
	speaker: false,
	jsxSpeaker: false,
	/** How many calls were made without ringing. */
	silenced: 0,
	/** How many calls rang. */
	rang: 0,
	/** How many times the silent call button was added to a header. */
	toggles: 0,
	/** How many times the remembered device was applied. */
	deviceApplied: 0,
}

/** Forgets what happened. Used when the plugin stops. */
export function resetState(): void {
	state.buttons = false
	state.jsxButtons = false
	state.ring = false
	state.httpPatched = 0
	state.callRequests = 0
	state.speaker = false
	state.jsxSpeaker = false
	state.silenced = 0
	state.rang = 0
	state.toggles = 0
	state.deviceApplied = 0
}
