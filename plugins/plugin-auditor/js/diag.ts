import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { setting } from './config'
import { auditor } from './store'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report is for finding out why the plugin broke on someone else's phone. It holds counts, versions, how the plugin
 * list was got, how long each step took, the errors, and what each of the plugin's own tools answered. It never holds the
 * VirusTotal key (only whether there is one), anyone's messages, or the code of the plugins that were scanned.
 */
export const diag = createDiagnostics('Plugin Auditor', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => ({
		includeBuiltIn: setting('includeBuiltIn'),
		includeSelf: setting('includeSelf'),
		autoScan: setting('autoScan'),
		notify: setting('notify'),
		hideNoise: setting('hideNoise'),
		vtKey: setting('vtKey') ? 'set' : 'not set',
		vtDomains: setting('vtDomains'),
		vtFast: setting('vtFast'),
		trusted: Object.keys(setting('trusted')).length,
		vtCache: Object.keys(setting('vtCache')).length,
	}),
	extra: () => auditor.reportLines(),
	checks: () => auditor.selfChecks(),
	consolePrefixes: ['[plugin-auditor'],
})
