/**
 * Better Calls.
 *
 * Adds options to calling: a button in DMs that makes calls silent (they do not ring the other person), and remembering which
 * audio output device you want in calls.
 *
 * Ported 1:1 to Valenced from the Revenge plugin by PalmDevs (https://github.com/PalmDevs/revenge-plugins).
 *
 * How it works. Starting a call goes through `CallActionCreators.ring`, which this plugin skips for calls that are silent.
 * The silent call button is added to `PrivateChannelButtons`, the buttons in a DM's header. The audio output device is
 * chosen with the `NATIVE_AUDIO_SET_OUTPUT_DEVICE` action each time the voice panel's speaker button is drawn during a call,
 * and that button is replaced with one that opens a list of the phone's devices.
 *
 * How it is put together:
 * - `silentCall.tsx` and `rememberOutputDevice.tsx` hold the patches,
 * - `audio.ts` finds Discord's audio parts, `AudioSheet.tsx` is the list of devices,
 * - `Settings.tsx` is the settings screen, and `config.ts`, `state.ts`, `discord.ts` and `diag.ts` are helpers.
 */

import { getAudioDevices, watchAudio } from './audio'
import { DEFAULT_SETTINGS, setDevice, store } from './config'
import { diag } from './diag'
import { installRememberDevice } from './rememberOutputDevice'
import { installRingBlock } from './ringBlock'
import Settings from './Settings'
import { installSilentCall } from './silentCall'
import { resetState } from './state'
import type { CallSettings } from './config'

/**
 * Keeps the remembered device real: it is the first device if none is saved, or if the saved one is not on the phone any more.
 */
export function refreshDevice(): void {
	let devices: ReturnType<typeof getAudioDevices> = []
	try {
		devices = getAudioDevices()
	} catch (error) {
		diag.fail('devices', error)
		return
	}
	const current = store.get('rememberOutputDevice').device
	const first = devices[0]
	if (!first) return
	if (!current) setDevice(first)
	// Checks if the saved device is still available.
	else if (
		!devices.some(
			d =>
				d.deviceId === current.deviceId && d.deviceType === current.deviceType,
		)
	)
		setDevice(first)
}

export default plugin<{ jsonStorage: CallSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		watchAudio(cleanup)

		let removeSilent: (() => void) | undefined
		let removeRemember: (() => void) | undefined

		/** Puts each patch on or takes it off to match the settings. */
		const sync = () => {
			refreshDevice()
			if (!store.get('silentCall').enabled) {
				removeSilent?.()
				removeSilent = undefined
			} else if (!removeSilent) {
				const removeButtons = installSilentCall()
				const removeRing = installRingBlock()
				removeSilent = () => {
					removeButtons()
					removeRing()
				}
			}

			if (!store.get('rememberOutputDevice').enabled) {
				removeRemember?.()
				removeRemember = undefined
			} else if (!removeRemember) removeRemember = installRememberDevice()
		}

		cleanup(store.subscribe(() => diag.guard('sync', sync)))
		cleanup(() => {
			removeSilent?.()
			removeRemember?.()
			removeSilent = undefined
			removeRemember = undefined
			store.clear()
			resetState()
		})
		diag.guard('sync', sync)
	},
})
