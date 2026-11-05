/**
 * What the plugin knows about Discord's slowmode list, shown on the settings screen.
 * It is plain data that the module finder callback fills in and the settings screen reads.
 */
export interface Status {
	/** Whether Discord's constants module has been found, in words. */
	found: string
	/** Whether the extended list is in place. */
	applied: boolean
	/** How many choices the extended list has. */
	count: number
	/** Why the list could not be replaced, if that happened. Empty otherwise. */
	error: string
}

/** The object that owns the list: Discord's constants module, or that module's default export. */
export interface ListHolder {
	SLOWMODE_VALUES?: unknown
}
