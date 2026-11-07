import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { state } from './state'
import { counts } from './store'

/** The report's words for a hook. */
const hookText = (hook: string): string =>
	hook === 'patched'
		? 'patched'
		: hook === 'failed'
			? 'FAILED to patch'
			: 'not found yet (open the / menu once)'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts, yes/no answers and the names of the fields Discord's results have, never the name or id of an app,
 * a server or a command.
 */
export const diag = createDiagnostics('Hide Slash Apps', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => counts(),
	extra: () => [
		`Module with the / menu's hooks: ${state.moduleSeen ? 'found' : 'not found yet'}`,
		`useDiscovery (the / menu): ${hookText(state.discovery)}; ran ${state.discoveryCalls} time(s), removed something ${state.discoveryFiltered} time(s)`,
		`useQuery (typing after /): ${hookText(state.query)}; ran ${state.queryCalls} time(s), removed something ${state.queryFiltered} time(s)`,
		`Removed in all: ${state.appsRemoved} app(s), ${state.commandsRemoved} command(s)`,
		`Watching the JSX runtime: ${state.jsx ? 'yes' : 'no'}`,
		`App icons of the rail: seen ${state.railSeen}, long press added ${state.railMenu}`,
		`App headers: seen ${state.headerSeen}, long press added ${state.headerMenu}`,
		`Command rows seen: ${state.rowSeen}`,
		`Hidden by the components themselves (second way): ${state.componentHid}`,
		`Long presses heard: ${state.longPresses}; sheets opened: ${state.sheets}; hidden: ${state.hid}; shown again: ${state.shown}`,
		`Last long press: ${state.lastPress || 'none yet'}`,
		`useDiscovery result had: ${state.discoveryShape || 'not seen yet'}`,
		`useQuery result had: ${state.queryShape || 'not seen yet'}`,
		`An app section had: ${state.sectionShape || 'not seen yet'}`,
		`A command had: ${state.commandShape || 'not seen yet'}`,
	],
	checks: () => [
		{
			ok: state.moduleSeen,
			label: 'Discord’s / menu module was found',
			detail: state.moduleSeen ? undefined : 'Open the / menu in a chat once',
		},
		{
			ok: state.discovery === 'patched',
			label: 'The / menu is filtered (useDiscovery)',
			detail:
				state.discovery === 'failed'
					? 'The hook was found but could not be patched'
					: undefined,
		},
		{
			ok: state.query === 'patched',
			label: 'Typing after / is filtered (useQuery)',
			detail:
				state.query === 'failed'
					? 'The hook was found but could not be patched'
					: undefined,
		},
		{
			ok: state.jsx,
			label: 'The plugin is watching Discord’s components',
		},
		{
			ok: state.railSeen > 0,
			label: 'The app icons at the bottom of the / menu were found',
			detail:
				state.railSeen > 0
					? undefined
					: 'Open the / menu: the icons only exist while it is open',
		},
		{
			ok: state.railSeen === 0 || state.railMenu > 0,
			label: 'The long press was added to the app icons',
		},
		{
			ok: state.longPresses === 0 || state.sheets > 0,
			label: 'A long press opened the hide menu',
			detail:
				state.longPresses > 0 && state.sheets === 0
					? `The press was heard ${state.longPresses} time(s) but no menu opened: ${state.lastPress}`
					: undefined,
		},
	],
	consolePrefixes: ['[hide-slash-apps', '[jsxFind'],
})
