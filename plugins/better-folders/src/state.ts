/** What the plugin has done since it started, for the settings screen and the report. */
export const state = {
	/** The JSX runtime hook that finds the folders, and whether a folder has been drawn. */
	jsx: false,
	folderSeen: 0,
	/** Folders drawn collapsed with the icons switched, and how many of those were changed. */
	collapsedDrawn: 0,
	iconsHidden: 0,
	/** Folders whose drawing did not look like what the plugin expects. */
	unexpected: 0,
	/** What a folder draws, as the names of its parts. Never a server or folder name. */
	folderShape: '',
	itemsShape: '',
	/** The module that works out a folder's colour. */
	colourModule: false,
	/** Auto collapse: whether the dispatcher and stores were reached, and what happened. */
	dispatcher: 'waiting' as 'waiting' | 'subscribed' | 'failed',
	storesOk: false,
	toggles: 0,
	collapsed: 0,
	last: '',
}

/** Starts counting again. Used when the plugin stops. */
export function resetState(): void {
	state.jsx = false
	state.folderSeen = 0
	state.collapsedDrawn = 0
	state.iconsHidden = 0
	state.unexpected = 0
	state.folderShape = ''
	state.itemsShape = ''
	state.colourModule = false
	state.dispatcher = 'waiting'
	state.storesOk = false
	state.toggles = 0
	state.collapsed = 0
	state.last = ''
}
