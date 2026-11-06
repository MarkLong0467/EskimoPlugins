/** Which of Discord's chat bar parts were found and patched, and what the plugin did. */
export const state = {
	/** Whether the hook on the JSX runtime is on, which is how the parts are found. */
	jsx: false,
	/** The send button (with the voice message button in it). */
	sendButton: false,
	/** The row of action buttons (apps, thread, gift) of the legacy chat bar. */
	actions: false,
	/** The right-hand action buttons of the redesigned chat bar. */
	rightActions: false,
	/** Whether the send button is drawn right now (it is not when it collapses with no text). */
	hasText: true,
	/** How many times the send button's own "has text" was wrapped. */
	sendWrapped: 0,
	/** How many times the action buttons' own "dismiss" was wrapped. */
	actionsWrapped: 0,
}

/** Forgets what happened. Used when the plugin stops. */
export function resetState(): void {
	state.jsx = false
	state.sendButton = false
	state.actions = false
	state.rightActions = false
	state.hasText = true
	state.sendWrapped = 0
	state.actionsWrapped = 0
}
