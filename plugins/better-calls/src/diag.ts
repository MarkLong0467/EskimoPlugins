import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { audioParts, getAudioDevices } from './audio'
import { store } from './config'
import { state } from './state'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts and the kinds of device, never the names of the people you call or of your devices.
 */
export const diag = createDiagnostics('Better Calls', {
	credit: [
		'Original plugin by PalmDevs (https://github.com/PalmDevs/revenge-plugins)',
		'Ported to Valenced by MarkLong0467 (https://github.com/MarkLong0467)',
	],
	settings: () => {
		const silent = store.get('silentCall')
		const remember = store.get('rememberOutputDevice')
		return {
			silentCall: {
				enabled: silent.enabled,
				default: silent.default,
				choices: Object.keys(silent.users ?? {}).length,
			},
			rememberOutputDevice: {
				enabled: remember.enabled,
				device: remember.device?.simpleDeviceType ?? 'none',
			},
		}
	},
	extra: () => {
		const devices = (() => {
			try {
				return getAudioDevices().map(d => d.simpleDeviceType)
			} catch {
				return []
			}
		})()
		return [
			`Calls without ringing: ${state.silenced}, calls that rang: ${state.rang}`,
			`Silent call button added to a header: ${state.toggles} time(s)`,
			`Remembered device applied: ${state.deviceApplied} time(s)`,
			`Devices on the phone now: ${devices.length ? devices.join(', ') : 'none'}`,
		]
	},
	checks: () => {
		const silent = !!store.get('silentCall').enabled
		const remember = !!store.get('rememberOutputDevice').enabled
		const parts = audioParts()
		return [
			{
				ok: !silent || state.ring,
				label: 'Discord’s ring was patched',
				detail: silent ? undefined : 'Silent calls are off',
			},
			{
				ok: !silent || state.buttons,
				label: 'The DM header buttons were patched',
				detail: silent
					? state.buttons
						? undefined
						: 'Open a DM to load them'
					: 'Silent calls are off',
			},
			{
				ok: !remember || state.speaker,
				label: 'The speaker button of the voice panel was patched',
				detail: remember
					? state.speaker
						? undefined
						: 'Join a call to load it'
					: 'Remembering the device is off',
			},
			{ ok: parts.store, label: 'The phone’s audio device list was found' },
			{ ok: parts.action, label: 'The audio output action was found' },
			{ ok: parts.helpers, label: 'The icons and names of devices were found' },
		]
	},
	consolePrefixes: ['[better-calls'],
})
