import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { getFolders, isExpanded, storesReachable } from './folders'
import { state } from './state'
import { isOn } from './store'

const hookText = (value: string): string =>
	value === 'subscribed'
		? 'listening'
		: value === 'failed'
			? 'FAILED'
			: 'not started'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts, yes/no answers and the names of the fields Discord's folder drawing has, never the name of a folder
 * or a server.
 */
export const diag = createDiagnostics('Better Folders', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => ({
		hideIcons: isOn('hideIcons'),
		autoCollapse: isOn('autoCollapse'),
	}),
	extra: () => {
		const folders = storesReachable() ? getFolders() : []
		return [
			`Folders in the server bar: ${storesReachable() ? folders.length : 'Discord’s folder stores could not be read'}; open now: ${folders.filter(f => f.folderId != null && isExpanded(f.folderId)).length}`,
			`Watching the JSX runtime: ${state.jsx ? 'yes' : 'no'}; folder drawn by Discord: ${state.folderSeen > 0 ? 'yes' : 'not yet'}`,
			`Collapsed folders drawn: ${state.collapsedDrawn}; server pictures swapped for the folder icon: ${state.iconsHidden}; drawn in a shape the plugin did not expect: ${state.unexpected}`,
			`Module that works out folder colours: ${state.colourModule ? 'found' : 'not found (icons keep their own tint)'}`,
			`Auto collapse: dispatcher ${hookText(state.dispatcher)}; stores readable: ${state.storesOk ? 'yes' : 'no'}; folder toggles seen: ${state.toggles}; other folders closed: ${state.collapsed}`,
			`Last thing that happened: ${state.last || 'nothing yet'}`,
			`A folder drew: ${state.folderShape || 'not seen yet'}`,
			`Its items were: ${state.itemsShape || 'not seen yet'}`,
		]
	},
	checks: () => [
		{
			ok: state.jsx,
			label: 'The plugin is watching Discord’s components',
		},
		{
			ok: state.folderSeen > 0,
			label: 'Discord’s folder component was found',
			detail:
				state.folderSeen > 0
					? undefined
					: 'Look at the server bar once. If you have no folders it is never drawn',
		},
		{
			ok: state.unexpected === 0,
			label: 'Folders are drawn the way the plugin expects',
			detail:
				state.unexpected > 0
					? 'Discord draws its folders differently now, so Hide icons cannot swap them. Send the report'
					: undefined,
		},
		{
			ok:
				!isOn('hideIcons') ||
				state.collapsedDrawn === 0 ||
				state.iconsHidden > 0,
			label: 'Hide icons swapped the pictures of a collapsed folder',
			detail:
				'If a collapsed folder still shows server pictures, the report’s “Its items were” line shows what Discord uses now',
		},
		{
			ok: state.dispatcher === 'subscribed',
			label: 'Auto collapse is listening for folders opening',
		},
		{
			ok: state.storesOk,
			label: 'Discord’s folder stores can be read (needed for Auto collapse)',
		},
		{
			ok:
				!isOn('autoCollapse') ||
				state.toggles === 0 ||
				state.collapsed > 0 ||
				getFolders().filter(f => f.folderId != null && isExpanded(f.folderId))
					.length <= 1,
			label: 'Auto collapse closed the other folders',
		},
	],
	consolePrefixes: ['[better-folders', '[jsxFind'],
})
