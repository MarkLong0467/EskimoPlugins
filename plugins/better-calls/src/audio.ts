import { lookupModule, lookupModules } from '@valenced/modules/finders'
import { propsFilter } from '../../../shared/palmdevs/finders'
import type { AudioDevice, SimpleAudioDeviceType } from './config'

/**
 * Discord's audio output devices. The originals found these with `findByProps`; each is a different module in Discord:
 * the store that lists the phone's devices (`getAudioDevices`), the action that chooses one (`setAudioOutputDevice`), and
 * the call helpers that have the icons and the names (`audioDeviceToIconMap`, `getAudioDeviceToDisplayText`).
 */

/** Something the exports of a module might be: the exports themselves or a default export. */
function pick<T extends object>(
	found: unknown,
	has: (value: Partial<T>) => boolean,
): T | undefined {
	const e = found as (Partial<T> & { default?: Partial<T> }) | undefined
	if (!e) return undefined
	if (has(e)) return e as T
	if (e.default && has(e.default)) return e.default as T
	return undefined
}

/** The store that knows the phone's audio devices (Android only). */
function deviceStore(): { getAudioDevices(): AudioDevice[] } | undefined {
	return pick(
		lookupModule(propsFilter('getAudioDevices'))[0],
		v => typeof v.getAudioDevices === 'function',
	)
}

/**
 * The action that chooses the output device. `MediaEngineStore` has a method of the same name that takes something else,
 * so a store is passed over: the right one is the module that is only the action.
 */
function deviceAction():
	| { setAudioOutputDevice(device: AudioDevice): void }
	| undefined {
	for (const [exports] of lookupModules(propsFilter('setAudioOutputDevice')) ??
		[]) {
		const found = pick<{ setAudioOutputDevice(device: AudioDevice): void }>(
			exports,
			v => typeof v.setAudioOutputDevice === 'function',
		)
		const isStore =
			!!found &&
			(typeof (found as { getName?: unknown }).getName === 'function' ||
				typeof (found as { emitChange?: unknown }).emitChange === 'function')
		if (found && !isStore) return found
	}
	return undefined
}

/** The helpers of calls: the icon of a device type and the text of a device. */
function callHelpers():
	| {
			audioDeviceToIconMap: Record<string, number>
			getAudioDeviceToDisplayText(
				device: Pick<AudioDevice, 'deviceType'>,
			): string
	  }
	| undefined {
	return pick(
		lookupModule(propsFilter('audioDeviceToIconMap'))[0],
		v =>
			!!v.audioDeviceToIconMap &&
			typeof v.getAudioDeviceToDisplayText === 'function',
	)
}

/** The phone's audio output devices right now. */
export function getAudioDevices(): AudioDevice[] {
	const list = deviceStore()?.getAudioDevices()
	return Array.isArray(list) ? list : []
}

/** Chooses the output device. */
export function setAudioOutputDevice(device: AudioDevice): void {
	deviceAction()?.setAudioOutputDevice(device)
}

/** The icon (an asset id) Discord uses for a type of device. */
export function getAudioDeviceIcon(
	simpleDeviceType: SimpleAudioDeviceType | undefined,
): number | undefined {
	return callHelpers()?.audioDeviceToIconMap?.[simpleDeviceType ?? 'INVALID']
}

/** What Discord calls a device, such as "Speaker" or "Bluetooth". */
export function getAudioDeviceDisplayText(
	device: Pick<AudioDevice, 'deviceType'>,
): string {
	return callHelpers()?.getAudioDeviceToDisplayText(device) ?? 'Unknown'
}

/** Whether each part was found, for the self-check. */
export function audioParts(): {
	store: boolean
	action: boolean
	helpers: boolean
} {
	return {
		store: !!deviceStore(),
		action: !!deviceAction(),
		helpers: !!callHelpers(),
	}
}
