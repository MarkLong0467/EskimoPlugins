import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { diagnostics } from './lib/register'
import { getSettings } from './lib/settings'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". */
export const diag = createDiagnostics('MaterialCord', {
	settings: getSettings,
	extra: () => {
		const status = diagnostics()
		return Object.entries(status).map(
			([key, value]) => `${key}: ${String(value)}`,
		)
	},
	checks: () => {
		const status = diagnostics()
		return [
			{
				ok: status.definitions > 0,
				label: 'Discord colour table found',
				detail: `${status.definitions} colours, tokens from ${status.tokens}`,
			},
			{
				ok: status.resolver === 'patched',
				label: 'Colour resolver installed',
				detail: String(status.resolver),
			},
			{
				ok: status.sync !== 'missing',
				label: 'Theme sync with Discord settings',
				detail: status.sync,
			},
			{
				ok: status.native > 0,
				label: 'Native colour hooks',
				detail: `${status.native} wrapped`,
			},
			{
				ok: !/^(no |error|not )/.test(status.test),
				label: 'Built-in self test',
				detail: String(status.test),
			},
		]
	},
	consolePrefixes: ['[materialcord'],
})
