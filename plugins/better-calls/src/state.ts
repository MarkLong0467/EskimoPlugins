/** What was found and patched, and what the plugin did, for the settings screen and the report. */
export const state = {
	/** The DM header buttons were patched. */
	buttons: false,
	/** Discord's `ring` was patched. */
	ring: false,
	/** The speaker button of the voice panel was patched. */
	speaker: false,
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
	state.ring = false
	state.speaker = false
	state.silenced = 0
	state.rang = 0
	state.toggles = 0
	state.deviceApplied = 0
}
