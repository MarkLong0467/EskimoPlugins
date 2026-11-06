import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { getAllRegisteredPlugins } from './lib/registry'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The library knows every plugin that uses it, so its report also lists them and what each one looked up.
 */
export const diag = createDiagnostics('kmmiio Library', {
	extra: () => {
		const plugins = getAllRegisteredPlugins()
		return [
			`plugins using the library: ${plugins.length}`,
			...plugins.map(p => `  ${p.id} ${p.version.nums.join('.')}`),
		]
	},
	consolePrefixes: ['[kmmiio-lib', '[kmmiio'],
})
