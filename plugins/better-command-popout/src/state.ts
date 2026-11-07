/** What the plugin has done since it started, for the settings screen and the report. */
export const state = {
	/** Whether the hook on Discord's `openLazy` is on, which is how the command popout is caught. */
	hooked: false,
	/** How many sheets were opened with the command popout's tag. */
	opened: 0,
	/** How many of those had their sheet component wrapped. */
	wrapped: 0,
	/** How many times the wrapped sheet was drawn. */
	sheetDraws: 0,
	/** How many times `CommandActionsContainer` was found in a drawn sheet, and how many times it was not. */
	containerFound: 0,
	containerMissing: 0,
	/** How many times the wrapped container was drawn. */
	containerDraws: 0,
	/** How many times the list of rows was found in a drawn container, and how many times it was not. */
	rowsFound: 0,
	rowsMissing: 0,
	/** How many times the two rows were added, and how many times a container had no command to copy from. */
	added: 0,
	noCommand: 0,
	/** How many times each row was pressed, and how many of those copies worked. */
	mentionPressed: 0,
	idPressed: 0,
	copied: 0,
	copyFailed: 0,
	/** The other sheet tags that look like a command popout, so a renamed tag can be seen in the report. */
	similarTags: [] as string[],
	/** What the last command had, as the names of its fields and the kind of each (never the values). */
	commandShape: '',
}

/** Forgets the counts. Used when the plugin stops. */
export function resetState(): void {
	state.hooked = false
	state.opened = 0
	state.wrapped = 0
	state.sheetDraws = 0
	state.containerFound = 0
	state.containerMissing = 0
	state.containerDraws = 0
	state.rowsFound = 0
	state.rowsMissing = 0
	state.added = 0
	state.noCommand = 0
	state.mentionPressed = 0
	state.idPressed = 0
	state.copied = 0
	state.copyFailed = 0
	state.similarTags = []
	state.commandShape = ''
}
