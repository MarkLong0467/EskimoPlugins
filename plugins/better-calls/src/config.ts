import { createStore } from '../../../shared/palmdevs/storage'

/** What Discord says about an audio output device. */
export type SimpleAudioDeviceType =
	| 'EARPIECE'
	| 'BLUETOOTH_HEADSET'
	| 'WIRED_HEADSET'
	| 'SPEAKERPHONE'
	| 'INVALID'

/** An audio output device of the phone. */
export interface AudioDevice {
	deviceName: string
	deviceId: number
	simpleDeviceType: SimpleAudioDeviceType
	deviceType: number
}

/** What the plugin saves. */
export interface CallSettings {
	silentCall: {
		/** Whether the silent call button is added. */
		enabled: boolean
		/** The choice for each DM or group: `true` is silent, `false` rings. A DM with no choice follows `default`. */
		users: Record<string, boolean | undefined>
		/** Whether a call is silent when there is no choice for it. */
		default: boolean
	}
	rememberOutputDevice: {
		enabled: boolean
		/** The device to use in calls. */
		device?: AudioDevice
	}
}

/** The settings used until the user changes something, the same as the original plugin's. */
export const DEFAULT_SETTINGS: CallSettings = {
	silentCall: { default: false, enabled: true, users: {} },
	rememberOutputDevice: { enabled: false },
}

/** The plugin's settings. */
export const store = createStore<CallSettings>(DEFAULT_SETTINGS)

/** The choice for one DM or group: `true` silent, `false` rings, nothing if it follows the default. */
export function silentFor(channelId: string): boolean | undefined {
	return store.get('silentCall').users?.[channelId]
}

/** Whether a call to a DM or group should be silent: its own choice, or else the default. */
export function shouldBeSilent(channelId: string): boolean {
	return silentFor(channelId) ?? !!store.get('silentCall').default
}

/** Saves the choice for one DM or group. `undefined` removes it, so it follows the default again. */
export function setSilentFor(
	channelId: string,
	value: boolean | undefined,
): void {
	const current = store.get('silentCall')
	const users = { ...(current.users ?? {}) }
	if (value === undefined) delete users[channelId]
	else users[channelId] = value
	store.replace('silentCall', { ...current, users })
}

/** Removes every choice. */
export function resetSilent(): void {
	store.replace('silentCall', { ...store.get('silentCall'), users: {} })
}

/** Saves the device to use in calls. */
export function setDevice(device: AudioDevice | undefined): void {
	const { device: _old, ...rest } = store.get('rememberOutputDevice')
	store.replace('rememberOutputDevice', device ? { ...rest, device } : rest)
}
