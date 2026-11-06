/** What the plugin did since it started, for the settings screen and the report. */
export const state = {
	/** The locale Discord used before the plugin changed it. */
	original: '',
	/** The locale that is applied now. */
	applied: '',
	/** How many locales were loaded, and how many of them failed. */
	loaded: 0,
	failed: 0,
	/** Whether the locales are all loaded. */
	ready: false,
	/** Whether the patch of `locale` and `lang` is on. */
	patched: false,
	/** How many times Discord tried to change the locale and was stopped. */
	blocked: 0,
}

/** Forgets what happened. Used when the plugin stops. */
export function resetState(): void {
	state.original = ''
	state.applied = ''
	state.loaded = 0
	state.failed = 0
	state.ready = false
	state.patched = false
	state.blocked = 0
}
