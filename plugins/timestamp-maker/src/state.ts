/** Whether Discord's module has been found and patched yet. */
export type HookState = 'waiting' | 'patched' | 'failed'

/** What the plugin has done since it started, for the settings screen and the report. */
export const state = {
	/** Discord's module with `getBuiltInCommands`, and how far the patch got. */
	commandModule: false,
	commandHook: 'waiting' as HookState,
	/** How often Discord asked for its built-in commands, and how often `/timestamp` was in the answer. */
	listCalls: 0,
	listWithOurs: 0,
	/** Whether Discord's own built-in command that sends nothing (`roll-dice`) was found to copy its kind from. */
	kindCopied: false,
	/** The kind of command and of option used, as numbers, for the report. */
	inputType: -1,
	/** The command was run, how often, and what its options had. */
	commandRuns: 0,
	lastRunOptions: '',
	/** The message module (`sendMessage`), and how far the patch got. */
	sendModule: false,
	sendHook: 'waiting' as HookState,
	/** The chat box, which is how a timestamp is put into the message you are writing. */
	inputSeen: false,
	inputRefKnown: false,
	/** The JSX runtime hook that finds the chat box. */
	jsx: false,
	/** Popups opened, and what they did. */
	popups: 0,
	sent: 0,
	inserted: 0,
	copied: 0,
	/** How `insert` got the text in: with the chat box, or through the saved draft. */
	insertWays: { box: 0, draft: 0, copy: 0 },
	/** `@time`: messages looked at, converted, and left alone because the time could not be read. */
	atSeen: 0,
	atConverted: 0,
	atUnreadable: 0,
	/** The last thing that happened, in words. */
	last: '',
}

/** Starts counting again. Used when the plugin stops. */
export function resetState(): void {
	state.commandModule = false
	state.commandHook = 'waiting'
	state.listCalls = 0
	state.listWithOurs = 0
	state.kindCopied = false
	state.inputType = -1
	state.commandRuns = 0
	state.lastRunOptions = ''
	state.sendModule = false
	state.sendHook = 'waiting'
	state.inputSeen = false
	state.inputRefKnown = false
	state.jsx = false
	state.popups = 0
	state.sent = 0
	state.inserted = 0
	state.copied = 0
	state.insertWays = { box: 0, draft: 0, copy: 0 }
	state.atSeen = 0
	state.atConverted = 0
	state.atUnreadable = 0
	state.last = ''
}
