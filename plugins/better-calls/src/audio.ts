import {
	getModules,
	lookupModule,
	lookupModules,
} from '@valenced/modules/finders'
import { propsFilter } from '../../../shared/palmdevs/finders'
import type { AudioDevice, SimpleAudioDeviceType } from './config'

/**
 * Discord's audio output devices. The originals found these with `findByProps`; each is a different module in Discord:
 * the store that lists the phone's devices (`getAudioDevices`), the action that chooses one (`setAudioOutputDevice`), and
 * the call helpers that have the icons and the names (`audioDeviceToIconMap`, `getAudioDeviceToDisplayText`).
 */

/**
 * What was found, kept as soon as Discord loads each part. Discord loads these modules late, the first time a call is
 * used, so a search at the start of the plugin or when the settings open may come too early. Each part is looked for with a
 * search now and again whenever Discord loads a matching module.
 */
const cache: { store?: unknown; action?: unknown; helpers?: unknown } = {}

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** Starts keeping the audio parts as Discord loads them. */
export function watchAudio(cleanup: Cleanup): void {
	for (const [part, prop] of [
		['store', 'getAudioDevices'],
		['action', 'setAudioOutputDevice'],
		['helpers', 'audioDeviceToIconMap'],
	] as const) {
		cleanup(
			getModules(propsFilter(prop), (exports: unknown) => {
				// A store with a method of the same name as the action is not the action.
				const isStore =
					part === 'action' &&
					(typeof (exports as { getName?: unknown } | null)?.getName ===
						'function' ||
						typeof (exports as { emitChange?: unknown } | null)?.emitChange ===
							'function')
				if (!isStore) cache[part] ??= exports
			}),
		)
	}
	cleanup(() => {
		cache.store = undefined
		cache.action = undefined
		cache.helpers = undefined
	})
}

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
		cache.store ?? lookupModule(propsFilter('getAudioDevices'))[0],
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
	type Action = { setAudioOutputDevice(device: AudioDevice): void }
	const isAction = (exports: unknown): Action | undefined => {
		const found = pick<Action>(
			exports,
			v => typeof v.setAudioOutputDevice === 'function',
		)
		const isStore =
			!!found &&
			(typeof (found as { getName?: unknown }).getName === 'function' ||
				typeof (found as { emitChange?: unknown }).emitChange === 'function')
		return found && !isStore ? found : undefined
	}
	const cached = isAction(cache.action)
	if (cached) return cached
	for (const [exports] of lookupModules(propsFilter('setAudioOutputDevice')) ??
		[]) {
		const found = isAction(exports)
		if (found) return found
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
		cache.helpers ?? lookupModule(propsFilter('audioDeviceToIconMap'))[0],
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
