import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { store } from './config'
import { findLocaleLoaders, findMoment } from './moment'
import { state } from './state'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 */
export const diag = createDiagnostics('Force Timestamp Locale', {
	credit: [
		'Original plugin by PalmDevs (https://github.com/PalmDevs/revenge-plugins)',
		'Ported to Valenced by MarkLong0467 (https://github.com/MarkLong0467)',
	],
	settings: () => ({ locale: store.get('locale') }),
	extra: () => [
		`Locale before the plugin: ${state.original || 'unknown'}`,
		`Locale applied: ${state.applied || 'none yet'}`,
		`Locales loaded: ${state.loaded}${state.failed ? `, ${state.failed} failed` : ''}`,
		`Discord's own changes blocked: ${state.blocked}`,
	],
	checks: () => [
		{ ok: !!findMoment(), label: 'The moment library was found' },
		{
			ok: !!findLocaleLoaders(),
			label: 'The list of locales was found',
		},
		{ ok: state.patched, label: 'The locale is locked' },
		{
			ok: state.ready,
			label: 'Every locale is loaded',
			detail: state.ready ? undefined : `${state.loaded} loaded so far`,
		},
		{
			ok: !state.applied || findMoment()?.locale() === state.applied,
			label: 'The locale in use is the chosen one',
			detail: state.applied,
		},
	],
	consolePrefixes: ['[force-timestamp-locale'],
})
