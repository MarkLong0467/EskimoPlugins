import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { store } from './config'
import { allGuilds, guildCount, isCommunity, optInActions } from './discord'
import { state } from './state'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts only, never the names of servers.
 */
export const diag = createDiagnostics('Auto Show All Channels', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => ({
		enabled: store.get('enabled'),
		handledServers: store.get('handled').length,
	}),
	extra: () => [
		`Watching for joins: ${state.armed ? 'yes' : 'not yet (Discord is still connecting)'}`,
		`Joins seen: ${state.joins}`,
		`Turned on: ${state.turnedOn}, already on: ${state.alreadyOn}, not community: ${state.skipped}, failed: ${state.failed}`,
		`Servers loaded: ${guildCount()}, community servers: ${allGuilds().filter(isCommunity).length}`,
	],
	checks: () => [
		{
			ok: !!optInActions(),
			label: 'Discord’s setGuildOptIn was found',
		},
		{
			ok: guildCount() > 0,
			label: 'Your servers are loaded',
		},
		{
			ok: state.armed,
			label: 'The plugin is watching for joins',
			detail: state.armed ? undefined : 'Discord is still connecting',
		},
		{
			ok: state.failed === 0,
			label: 'No server failed',
			detail: state.failed ? `${state.failed} failed` : undefined,
		},
	],
	consolePrefixes: ['[auto-show-all-channels'],
})
