import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { state } from './state'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts, yes/no answers and the names of Discord's components, never the text of a message or the name or
 * id of a command.
 */
export const diag = createDiagnostics('Better Command Popout', {
	credit: [
		'Original plugin by aliernfrog (https://github.com/aliernfrog/vd-plugins)',
		'Ported to Valenced by MarkLong0467 (https://github.com/MarkLong0467)',
	],
	extra: () => [
		`Hook on openLazy: ${state.hooked ? 'on' : 'off'}`,
		`Command popouts opened: ${state.opened} (sheet wrapped ${state.wrapped}, drawn ${state.sheetDraws})`,
		`CommandActionsContainer: found ${state.containerFound}, missing ${state.containerMissing}, drawn ${state.containerDraws}`,
		`Rows list: found ${state.rowsFound}, missing ${state.rowsMissing}`,
		`Rows added: ${state.added} time(s); drawn without a command: ${state.noCommand}`,
		`Command had: ${state.commandShape || 'not seen yet'}`,
		`Pressed: mention ${state.mentionPressed}, id ${state.idPressed}; copied ${state.copied}, failed ${state.copyFailed}`,
		`Other tags that look like a command popout: ${state.similarTags.length ? state.similarTags.join(', ') : 'none'}`,
	],
	checks: () => {
		const opened = state.opened > 0
		return [
			{
				ok: state.hooked,
				label: 'The plugin is watching Discord’s action sheets',
				detail: state.hooked
					? undefined
					: 'The hook on openLazy was not installed',
			},
			{
				ok: opened,
				label: 'A command popout was opened',
				detail: opened
					? undefined
					: 'Tap a slash command in a message to open one',
			},
			{
				ok: !opened || state.wrapped >= state.opened,
				label: 'The popout’s sheet was wrapped',
				detail:
					!opened || state.wrapped >= state.opened
						? undefined
						: 'Discord opened it with something that is not a plain component',
			},
			{
				ok:
					!opened || (state.containerFound > 0 && state.containerMissing === 0),
				label: 'CommandActionsContainer was found in the sheet',
				detail:
					state.containerMissing > 0
						? 'Discord renamed it or moved it. The report lists the components it drew'
						: undefined,
			},
			{
				ok: !opened || (state.rowsFound > 0 && state.rowsMissing === 0),
				label: 'The list of rows was found in the container',
				detail:
					state.rowsMissing > 0
						? 'Discord changed how the rows are drawn. The report lists the components it drew'
						: undefined,
			},
			{
				ok: !opened || state.added > 0,
				label: 'The copy rows were added',
			},
			{
				ok: state.copyFailed === 0,
				label: 'Copying to the clipboard works',
				detail:
					state.copyFailed > 0
						? `${state.copyFailed} copy attempt(s) failed`
						: undefined,
			},
		]
	},
	consolePrefixes: ['[better-command-popout'],
})
