import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { state } from './state'
import { setting } from './store'
import type { Settings } from './store'

const hookText = (hook: string): string =>
	hook === 'patched'
		? 'patched'
		: hook === 'failed'
			? 'FAILED to patch'
			: 'not found yet'

/** The settings for the report. The recents are counted, never listed. */
function reportedSettings(): Record<string, unknown> {
	const keys: Array<keyof Settings> = [
		'command',
		'atTime',
		'atTimeStyle',
		'action',
		'skipPopup',
		'remember',
		'style',
		'alsoRelative',
		'code',
		'zone',
		'minuteStep',
		'h24',
		'order',
		'rollForward',
		'quickPicks',
		'recentsMax',
	]
	const out: Record<string, unknown> = {}
	for (const key of keys) out[key] = setting(key)
	out.hasMessageTemplate = setting('message').trim().length > 0
	out.recents = setting('recents').length
	return out
}

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts, yes/no answers and settings. It never has a message you wrote, a time you picked, a channel or a
 * server.
 */
export const diag = createDiagnostics('Timestamp Maker', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: reportedSettings,
	extra: () => [
		`Module with getBuiltInCommands: ${state.commandModule ? 'found' : 'not found yet'}; patch ${hookText(state.commandHook)}`,
		`Command kind copied from Discord's own (roll-dice): ${state.kindCopied ? 'yes' : 'no, used the default'}; input type ${state.inputType}`,
		`Discord asked for its built-in commands ${state.listCalls} time(s); /timestamp was in the answer ${state.listWithOurs} time(s)`,
		`/timestamp was run ${state.commandRuns} time(s); last options: ${state.lastRunOptions || 'none yet'}`,
		`Message module (sendMessage): ${state.sendModule ? 'found' : 'not found yet'}; patch ${hookText(state.sendHook)}`,
		`Watching the JSX runtime: ${state.jsx ? 'yes' : 'no'}; chat box seen: ${state.inputSeen ? 'yes' : 'no'}; chat box ref known: ${state.inputRefKnown ? 'yes' : 'no'}`,
		`Popup scroll view: ${state.sheetScroller || 'popup not opened yet'}`,
		`Popups opened: ${state.popups}; sent: ${state.sent}; put in the message: ${state.inserted}; copied: ${state.copied}`,
		`Put in the message by: chat box ${state.insertWays.box}, draft ${state.insertWays.draft}, copy instead ${state.insertWays.copy}`,
		`@time: messages looked at ${state.atSeen}; converted ${state.atConverted}; left as typed because the time was not understood ${state.atUnreadable}`,
		`Last thing that happened: ${state.last || 'nothing yet'}`,
	],
	checks: () => [
		{
			ok: state.commandModule,
			label: 'Discord’s built-in command list was found',
			detail: state.commandModule
				? undefined
				: 'Open the / menu in a chat once',
		},
		{
			ok: state.commandHook === 'patched',
			label: '/timestamp was added to the list',
			detail:
				state.commandHook === 'failed'
					? 'The list was found but could not be changed'
					: undefined,
		},
		{
			ok:
				state.listCalls === 0 || state.listWithOurs > 0 || !setting('command'),
			label: 'Discord’s answer included /timestamp',
			detail:
				'If this fails the command is switched off, or Discord changed how it asks for built-in commands',
		},
		{
			ok: state.sendHook === 'patched' || !setting('atTime'),
			label: '@time can be turned into a timestamp when you send',
			detail:
				state.sendHook === 'failed'
					? 'The message module was found but could not be changed'
					: state.sendModule
						? undefined
						: 'Send any message once',
		},
		{
			ok: state.inputRefKnown,
			label: 'The chat box was found (needed for Add to message)',
			detail: state.inputRefKnown
				? undefined
				: 'Open a chat. Without it, Add to message falls back to the saved draft',
		},
		{
			ok: state.sheetScroller !== 'plain scroll view',
			label: 'The popup can scroll inside the sheet',
			detail:
				'Discord’s bottom-sheet scroll view was not found, so the popup may not scroll. Send the report',
		},
		{
			ok: state.commandRuns === 0 || state.popups > 0 || setting('skipPopup'),
			label: 'Running /timestamp opened the popup',
			detail:
				state.commandRuns > 0 && state.popups === 0
					? `The command ran ${state.commandRuns} time(s) but no popup opened: ${state.last}`
					: undefined,
		},
	],
	consolePrefixes: ['[timestamp-maker', '[jsxFind'],
})
