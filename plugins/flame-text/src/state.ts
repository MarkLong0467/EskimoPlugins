/** Whether Discord's module has been found and patched yet. */
export type HookState = 'waiting' | 'patched' | 'failed'

/** Why a message was sent as normal text. */
export type SkipReason =
	| 'empty'
	| 'attachment'
	| 'sticker'
	| 'link'
	| 'code'
	| 'special'
	| 'long'
	| 'unsupported'
	| 'toobig'

const skipped = (): Record<SkipReason, number> => ({
	empty: 0,
	attachment: 0,
	sticker: 0,
	link: 0,
	code: 0,
	special: 0,
	long: 0,
	unsupported: 0,
	toobig: 0,
})

/** What the plugin has done since it started, for the settings screen and the report. */
export const state = {
	/** The message module (`sendMessage`), and how far the patch got. */
	sendModule: false,
	sendHook: 'waiting' as HookState,
	/** Discord's file code (`writeFile`), its upload class and the number it uses for this kind of device. */
	fileModule: false,
	uploadModule: false,
	platform: 'not found' as string,
	/** The built-in command list. */
	commandModule: false,
	commandHook: 'waiting' as HookState,
	listCalls: 0,
	listWithOurs: 0,
	kindCopied: false,
	inputType: -1,
	commandRuns: 0,
	toggles: 0,
	/** The chat box: whether the JSX runtime is watched and which parts of the chat box were drawn. */
	jsx: false,
	sendButtonSeen: false,
	actionsSeen: false,
	buttonDrawn: 0,
	buttonTaps: 0,
	/** Messages looked at while it was on, made into GIFs, sent as text instead, and why. */
	seen: 0,
	flamed: 0,
	fellBack: 0,
	failed: 0,
	skipped: skipped(),
	/** The step the last GIF was at, and how the last one went. */
	stage: 'none yet' as string,
	lastMs: 0,
	lastBytes: 0,
	lastSize: '',
	lastFrames: 0,
	lastError: '',
	previews: 0,
	last: '',
}

/** Starts counting again. Used when the plugin stops. */
export function resetState(): void {
	state.sendModule = false
	state.sendHook = 'waiting'
	state.fileModule = false
	state.uploadModule = false
	state.platform = 'not found'
	state.commandModule = false
	state.commandHook = 'waiting'
	state.listCalls = 0
	state.listWithOurs = 0
	state.kindCopied = false
	state.inputType = -1
	state.commandRuns = 0
	state.toggles = 0
	state.jsx = false
	state.sendButtonSeen = false
	state.actionsSeen = false
	state.buttonDrawn = 0
	state.buttonTaps = 0
	state.seen = 0
	state.flamed = 0
	state.fellBack = 0
	state.failed = 0
	state.skipped = skipped()
	state.stage = 'none yet'
	state.lastMs = 0
	state.lastBytes = 0
	state.lastSize = ''
	state.lastFrames = 0
	state.lastError = ''
	state.previews = 0
	state.last = ''
}
