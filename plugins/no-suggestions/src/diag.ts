import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { hasDiscordClear } from './clear'
import { state } from './state'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts only, never the names of channels or servers.
 */
export const diag = createDiagnostics('No Suggestions', {
	credit: [
		'Original plugin by PalmDevs (https://github.com/PalmDevs/revenge-plugins)',
		'Ported to Valenced by MarkLong0467 (https://github.com/MarkLong0467)',
	],
	extra: () => [
		`Watching the JSX runtime: ${state.jsx ? 'yes' : 'no'}`,
		`Section replaced: ${state.replaced} time(s), patched in its module: ${state.patched}`,
		`Rendered while empty: ${state.empty}`,
		`Cleared: ${state.cleared} time(s), ${state.channelsCleared} channel(s) (by Discord's function ${state.clearedByDiscord}, by the event ${state.clearedByEvent})`,
	],
	checks: () => [
		{
			ok: state.jsx,
			label: 'The plugin is watching Discord’s components',
		},
		{
			ok: state.replaced > 0 || state.patched > 0,
			label: 'The suggested channels section was found',
			detail:
				state.replaced > 0 || state.patched > 0
					? undefined
					: 'Open a server that has the Suggested section',
		},
		{
			ok: hasDiscordClear() || state.clearedByEvent > 0,
			label: 'Suggestions can be cleared',
			detail: hasDiscordClear()
				? 'Discord’s own function was found'
				: 'Discord has not loaded its function yet, so the event alone is used',
		},
	],
	consolePrefixes: ['[no-suggestions', '[jsxFind'],
})
