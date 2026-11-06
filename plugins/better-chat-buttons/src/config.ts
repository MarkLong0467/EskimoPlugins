import { createStore } from '../../../shared/palmdevs/storage'

/** Which buttons to hide. */
export interface HideSettings {
	/** The Apps & Commands button. */
	app: boolean
	/** The gift button. */
	gift: boolean
	/** The new thread button. */
	thread: boolean
	/** The voice message button. */
	voice: boolean
}

/** What the plugin saves. */
export interface ButtonSettings {
	hide: HideSettings
	collapse: {
		/** Collapse the action buttons when you start typing (the legacy chat bar). */
		actions: boolean
		/** Collapse the send button when the message box is empty. */
		send: boolean
	}
}

/** The settings used until the user changes something, the same as the original plugin's. */
export const DEFAULT_SETTINGS: ButtonSettings = {
	hide: { app: true, gift: true, thread: true, voice: true },
	collapse: { actions: true, send: false },
}

/** The plugin's settings. */
export const store = createStore<ButtonSettings>(DEFAULT_SETTINGS)

/** Whether a button is hidden. */
export const hidden = (key: keyof HideSettings): boolean =>
	!!store.get('hide')[key]
