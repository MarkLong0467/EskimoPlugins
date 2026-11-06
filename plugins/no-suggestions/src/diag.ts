import { lookupModule } from '@valenced/modules/finders'
import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { propsFilter } from '../../../shared/palmdevs/finders'
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
		`Suggested sections patched: ${state.patched}`,
		`Rendered while empty: ${state.empty}`,
		`Cleared: ${state.cleared} time(s), ${state.channelsCleared} channel(s)`,
	],
	checks: () => {
		let clear = false
		try {
			clear =
				typeof (
					lookupModule(propsFilter('clearRecentChannels'))[0] as
						| { clearRecentChannels?: unknown }
						| undefined
				)?.clearRecentChannels === 'function'
		} catch {
			clear = false
		}
		return [
			{
				ok: state.patched > 0,
				label: 'The suggested channels section was found and patched',
				detail: state.patched > 0 ? undefined : 'Open a server to load it',
			},
			{
				ok: clear,
				label: 'Discord’s "clear recent channels" was found',
			},
		]
	},
	consolePrefixes: ['[no-suggestions'],
})
