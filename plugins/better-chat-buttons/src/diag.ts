import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { store } from './config'
import { state } from './state'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 */
export const diag = createDiagnostics('Better Chat Buttons', {
	credit: [
		'Original plugin by PalmDevs (https://github.com/PalmDevs/revenge-plugins)',
		'Ported to Valenced by MarkLong0467 (https://github.com/MarkLong0467)',
	],
	settings: () => ({
		hide: store.get('hide'),
		collapse: store.get('collapse'),
	}),
	extra: () => [
		`Watching the JSX runtime: ${state.jsx ? 'yes' : 'no'}`,
		`Send button drawn: ${state.hasText ? 'yes' : 'no (collapsed)'}`,
		`Send button's own state wrapped: ${state.sendWrapped} time(s)`,
		`Action buttons' own dismiss wrapped: ${state.actionsWrapped} time(s)`,
	],
	checks: () => [
		{
			ok: state.sendButton,
			label: 'The send button was found',
			detail: state.sendButton ? undefined : 'Open a chat to load it',
		},
		{
			ok: state.actions,
			label: 'The legacy action buttons were found',
			detail: state.actions ? undefined : 'Only older chat bars have them',
		},
		{
			ok: state.rightActions,
			label: 'The redesigned action buttons were found',
			detail: state.rightActions ? undefined : 'Open a chat to load them',
		},
	],
	consolePrefixes: ['[better-chat-buttons', '[jsxFind'],
})
