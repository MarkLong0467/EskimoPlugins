import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { minutes, store } from './config'
import { hasConnection, state } from './engine'

/** "3 min 20 s" for a length of time. */
function length(ms: number): string {
	const s = Math.round(ms / 1000)
	return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`
}

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts and switches only, never who is in the call.
 */
export const diag = createDiagnostics('Call Battery Saver', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => ({
		skipKrisp: store.get('skipKrisp'),
		pauseProcessing: store.get('pauseProcessing'),
		pauseVideo: store.get('pauseVideo'),
		remindMinutes: minutes('remindMinutes'),
		leaveMinutes: minutes('leaveMinutes'),
		timerWhen: store.get('timerWhen'),
	}),
	extra: () => {
		const paused =
			state.pausedMs + (state.pausedSince ? Date.now() - state.pausedSince : 0)
		return [
			`In a call: ${state.inCall}, muted: ${state.muted}, deafened: ${state.deafened}`,
			`Skip Krisp while muted applied: ${state.skipKrispApplied} time(s)`,
			`Mic processing paused: ${state.processingPauses} time(s), ${length(paused)} in all${state.processingPaused ? ' (paused now)' : ''}`,
			`Cameras paused while deafened: ${state.videosPaused}`,
			`Reminders: ${state.reminders}, calls left: ${state.leaves}`,
			state.countingSince
				? `Timer counting for ${length(Date.now() - state.countingSince)}`
				: 'Timer not counting',
			state.lastError ? `Last error: ${state.lastError}` : 'No errors',
		]
	},
	checks: () => [
		{ ok: state.media, label: 'Discord’s media engine store was found' },
		{ ok: state.voice, label: 'The voice channel store was found' },
		{ ok: state.voiceStates, label: 'The voice state store was found' },
		{
			ok: state.patched || !state.inCall,
			label: 'The voice connection was patched',
			detail: state.inCall
				? hasConnection()
					? undefined
					: 'No voice connection found in the call'
				: 'Join a call to check this',
		},
		{
			ok: !state.lastError,
			label: 'No errors from the voice engine',
			detail: state.lastError || undefined,
		},
	],
	consolePrefixes: ['[call-battery-saver'],
})
