/** Whether Discord's hook has been found and patched yet. */
export type HookState = 'waiting' | 'patched' | 'failed'

/** What the plugin has done since it started, for the settings screen and the report. */
export const state = {
	/** The module with the `/` menu's hooks (`useDiscovery`, `useQuery`), and how far each hook got. */
	moduleSeen: false,
	discovery: 'waiting' as HookState,
	query: 'waiting' as HookState,
	/** How many times each hook ran, and how many of those runs had something removed from what Discord returned. */
	discoveryCalls: 0,
	discoveryFiltered: 0,
	queryCalls: 0,
	queryFiltered: 0,
	/** How many apps and commands were taken out in all. */
	appsRemoved: 0,
	commandsRemoved: 0,
	/** What Discord's results look like: the names of their fields, never their contents. */
	discoveryShape: '',
	queryShape: '',
	sectionShape: '',
	commandShape: '',
	/** Whether the hook on the JSX runtime is on, which is how the rail, headers and rows are found. */
	jsx: false,
	/** The app icons of the rail at the bottom of the `/` menu. */
	railSeen: 0,
	railMenu: 0,
	/** The headers above each app's commands. */
	headerSeen: 0,
	headerMenu: 0,
	/** The command rows. */
	rowSeen: 0,
	/** How many times a rail icon, header or row that should be hidden was hidden by the component itself (the second way). */
	componentHid: 0,
	/** How many long presses were heard, sheets opened and hides done. */
	longPresses: 0,
	sheets: 0,
	hid: 0,
	shown: 0,
	/** The result of the last long press, in words. */
	lastPress: '',
	/** How many command rows had the long press added. */
	rowMenu: 0,
	/** How many apps lost a whole list of commands because every command in it was hidden. */
	groupsRemoved: 0,
	/** The built-in commands Discord has returned so far, by id, with their names. Used for the switches in the settings. */
	builtins: new Map<string, string>(),
	/** Whether a menu has told the plugin which server it is open in, and which one. A command row uses this. */
	menuGuildKnown: false,
	menuGuild: undefined as string | undefined,
}

/** Forgets the counts. Used when the plugin stops. */
export function resetState(): void {
	state.moduleSeen = false
	state.discovery = 'waiting'
	state.query = 'waiting'
	state.discoveryCalls = 0
	state.discoveryFiltered = 0
	state.queryCalls = 0
	state.queryFiltered = 0
	state.appsRemoved = 0
	state.commandsRemoved = 0
	state.discoveryShape = ''
	state.queryShape = ''
	state.sectionShape = ''
	state.commandShape = ''
	state.jsx = false
	state.railSeen = 0
	state.railMenu = 0
	state.headerSeen = 0
	state.headerMenu = 0
	state.rowSeen = 0
	state.componentHid = 0
	state.longPresses = 0
	state.sheets = 0
	state.hid = 0
	state.shown = 0
	state.lastPress = ''
	state.rowMenu = 0
	state.groupsRemoved = 0
	state.builtins.clear()
	state.menuGuildKnown = false
	state.menuGuild = undefined
}
