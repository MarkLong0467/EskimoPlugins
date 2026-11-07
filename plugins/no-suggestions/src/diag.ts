import { Stores } from '@valenced/discord/flux'
import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { hasDiscordClear, probe } from './clear'
import { state } from './state'

/** The size of one of Discord's stores that decide what the Suggested section holds, or `n/a` if it is not there. */
function storeSize(store: string, method: string, arg?: string): string {
	try {
		const result = (
			Stores as unknown as Record<
				string,
				Record<string, ((arg?: string) => unknown) | undefined> | undefined
			>
		)[store]?.[method]?.(arg)
		if (result instanceof Set || result instanceof Map) return `${result.size}`
		if (Array.isArray(result)) return `${result.length}`
		return result == null ? 'n/a' : String(result)
	} catch {
		return 'n/a'
	}
}

/** The server that is open, for the numbers of the report. Only the count of channels is written, never names or ids. */
function openGuild(): string | undefined {
	try {
		return (
			(
				Stores as unknown as {
					SelectedGuildStore?: { getGuildId?: () => string | null }
				}
			).SelectedGuildStore?.getGuildId?.() ?? undefined
		)
	} catch {
		return undefined
	}
}

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts and yes/no answers, never the names of channels or servers.
 */
export const diag = createDiagnostics('No Suggestions', {
	credit: [
		'Original plugin by PalmDevs (https://github.com/PalmDevs/revenge-plugins)',
		'Ported to Valenced by MarkLong0467 (https://github.com/MarkLong0467)',
	],
	extra: () => {
		const guild = openGuild()
		return [
			`Watching the JSX runtime: ${state.jsx ? 'yes' : 'no'}`,
			`Section replaced: ${state.replaced} time(s), patched in its module: ${state.patched}`,
			`Rendered while empty: ${state.empty}`,
			`Cleared: ${state.cleared} time(s), ${state.channelsCleared} channel(s) (by Discord's function ${state.clearedByDiscord}, by its parts ${state.clearedByParts}, by the event alone ${state.clearedByEvent}), ${state.acked} marked read`,
			`Discord's own clear function: ${state.how ? `found ${state.how}` : 'not found yet'}`,
			`Drawn again with channels after a clear: ${state.stuck} time(s)`,
			...Object.entries(probe()).map(
				([name, value]) => `Looked up just now: ${name}: ${value}`,
			),
			`Open server: ${guild ? 'yes' : 'none'}; new channels in it: ${guild ? storeSize('NewChannelsStore', 'getNewChannelIds', guild) : 'n/a'}`,
		]
	},
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
			ok: hasDiscordClear() || state.clearedByParts > 0,
			label: 'Discord’s own clear function can be used',
			detail: hasDiscordClear()
				? `Found ${state.how || 'just now'}`
				: 'Not found, so its parts or the event alone are used, and rows may stay',
		},
		{
			ok: state.stuck === 0,
			label: 'Suggestions stay cleared',
			detail:
				state.stuck === 0
					? undefined
					: `The section was drawn with channels again ${state.stuck} time(s) after a clear`,
		},
	],
	consolePrefixes: ['[no-suggestions', '[jsxFind'],
})
