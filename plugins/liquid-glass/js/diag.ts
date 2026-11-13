import { Platform } from 'react-native'
import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { store } from './config'
import { isLiquidGlassSupported } from './glass'
import { lightTheme } from './look'
import { counts } from './state'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". */
export const diag = createDiagnostics('Liquid Glass', {
	credit: [
		'Original library by Callstack (https://github.com/callstack/liquid-glass)',
		'Ported to Valenced by MarkLong0467 (https://github.com/MarkLong0467)',
	],
	settings: () => ({
		buttons: store.get('buttons'),
		bar: store.get('bar'),
		cards: store.get('cards'),
		fields: store.get('fields'),
		sheets: store.get('sheets'),
		strength: store.get('strength'),
		tint: store.get('tint'),
	}),
	extra: () => [
		`Platform: ${Platform.OS} ${String(Platform.Version)}`,
		`Real liquid glass: ${isLiquidGlassSupported ? 'yes (native view found)' : 'no, frosted fallback'}`,
		`Discord theme: ${lightTheme() ? 'light' : 'dark'}`,
		...Object.entries(counts).map(
			([name, count]) =>
				`Frost on ${name}: ${count.frosted} of ${count.seen} drawn`,
		),
	],
})
