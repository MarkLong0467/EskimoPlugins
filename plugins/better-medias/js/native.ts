/**
 * Calls into the native half (source/android/marklong/bettermedias/BetterMedias.java). Every call is safe: if the native half
 * did not load, the call does nothing and the rest of the plugin still works.
 */
import { callNativeMethod } from '@valenced/modules/native'
import { current } from './config'

export const PREFIX = 'marklong.bettermedias.'

/** Whether the native half answered at least once. */
export let nativeReady = false

export function call<N extends keyof NativeBetterMedias>(name: N, args: NativeBetterMedias[N][0]): Promise<NativeBetterMedias[N][1] | undefined> {
	try {
		return (callNativeMethod(`${PREFIX}${name}` as never, args as never) as Promise<NativeBetterMedias[N][1]>).then(
			value => {
				nativeReady = true
				return value
			},
			() => undefined,
		)
	} catch {
		return Promise.resolve(undefined)
	}
}

/** Sends the settings to the native half. */
export function sendConfig(): void {
	void call('config', [JSON.stringify(current())])
}

/** The notification's state for one piece of media. */
export interface MediaState {
	target: string
	title: string
	subtitle: string
	durationMs: number
	positionMs: number
	playing: boolean
	canSeek: boolean
}

export function sendUpdate(state: MediaState): void {
	void call('update', [JSON.stringify(state)])
}

export function clearMedia(target: string): void {
	void call('clear', [target])
}

export function openMini(url: string, positionMs: number, title: string, playing: boolean): void {
	void call('miniOpen', [url, Math.max(0, Math.round(positionMs)), title, playing])
}

export function miniCommand(command: 'play' | 'pause' | 'close'): void {
	void call('mini', [command])
}

/** The chat video that plays now: when Discord is left, the small player shows it in Picture-in-Picture. */
/** The file Discord's chat player plays now: the native half finds the player holding it, to seek it. */
export function sendNativeSource(url: string): void {
	void call('nativeSource', [url])
}

export function sendNativeVideo(url: string, positionMs: number, title: string, playing: boolean): void {
	void call('nativeVideo', [url, Math.max(0, Math.round(positionMs)), title, playing])
}

export function setPip(wanted: boolean, width: number, height: number, inCall: boolean, by: string): void {
	void call('pip', [wanted, Math.round(width) || 16, Math.round(height) || 9, inCall, by])
}

/** The bridge methods of the native half: [arguments, result]. */
export interface NativeBetterMedias {
	config: [[json: string], boolean]
	update: [[json: string], boolean]
	clear: [[target: string], boolean]
	miniOpen: [[url: string, positionMs: number, title: string, playing: boolean], boolean]
	mini: [[command: string], boolean]
	miniState: [[], string]
	pip: [[wanted: boolean, width: number, height: number, inCall: boolean, by: string], boolean]
	nativeSource: [[url: string], boolean]
	nativeVideo: [[url: string, positionMs: number, title: string, playing: boolean], boolean]
	status: [[], string]
	report: [[], string]
	nextAction: [[], string]
}
