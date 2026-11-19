/**
 * Voice messages and audio files.
 *
 * Voice messages: Discord's `VoiceMessagesPlaybackManager` listens for APP_STATE_UPDATE and, on Android, tells its native
 * audio player to pause when Discord leaves the screen (and to play again when it comes back). With "Voice messages" on, that
 * one listener is swapped for one that skips it; every other part of Discord still hears APP_STATE_UPDATE.
 *
 * Media inside chats (audio files and voice messages are played by Discord's native player): Discord's native
 * `MediaPlayerManager` reports what plays, its position and its length. That feeds the notification, whose play and pause
 * use the same module. (Seeking it is not something the module offers, so its notification has no seek bar.)
 */
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { NativeEventEmitter, NativeModules } from 'react-native'
import { count, errorText, found, note } from './diag'
import { clearMedia, sendUpdate } from './native'
import { on } from './config'
import { titleOf } from './videos'

type Cleanup = (...fns: Array<() => unknown>) => unknown

const VOICE_MANAGER_PATH = 'modules/voice_messages/native/VoiceMessagesPlaybackManager.tsx'

interface Dispatcher {
	subscribe(type: string, handler: (action: any) => void): void
	unsubscribe(type: string, handler: (action: any) => void): void
}

function findDispatcher(): Dispatcher | undefined {
	try {
		const [module] = lookupModule(withProps('subscribe', 'unsubscribe', 'dispatch', 'isDispatching'))
		const dispatcher = (module as any)?.default ?? module
		if (typeof dispatcher?.subscribe === 'function' && typeof dispatcher?.unsubscribe === 'function') return dispatcher
	} catch {}
	return undefined
}

function startVoiceMessages(cleanup: Cleanup): void {
	cleanup(
		getModuleWithImportedPath<{ default?: any }>(VOICE_MANAGER_PATH, module => {
			const manager = module?.default
			const original = manager?.handleAppStateChanged
			if (typeof original !== 'function') {
				found('voice message manager', 'no handleAppStateChanged')
				return
			}
			const dispatcher = findDispatcher()
			if (!dispatcher) {
				found('voice message manager', 'found, but not Discord’s dispatcher')
				return
			}
			const instead = (action: any) => {
				if (on('backgroundVoice') && action?.state && action.state !== 'active') {
					count('voice message kept playing on leave')
					return
				}
				original(action)
			}
			try {
				dispatcher.unsubscribe('APP_STATE_UPDATE', original)
				dispatcher.subscribe('APP_STATE_UPDATE', instead)
				found('voice message manager', 'patched')
			} catch (error) {
				found('voice message manager', `error: ${errorText(error)}`)
				return
			}
			cleanup(() => {
				try {
					dispatcher.unsubscribe('APP_STATE_UPDATE', instead)
					dispatcher.subscribe('APP_STATE_UPDATE', original)
				} catch {}
			})
		}),
	)
}

/** Discord's native player for media inside chats, when this build has it. */
interface NativePlayerModule {
	playCurrentPlayer?: () => void
	pauseCurrentPlayer?: () => void
}

let nativeSource: any
let nativeRate = 0
let nativeTime = 0
let nativeDuration = 0
let nativeAt = 0
let lastRaw = ''

/** Seconds or milliseconds? Discord does not say: a "length" over 3 hours is taken as milliseconds. */
const toMs = (value: number, duration: number) => (duration > 3 * 3600 ? value : value * 1000)

function nativeTitle(source: any): { title: string; subtitle: string } {
	const voice = !!(source?.isVoiceMessage ?? /voice-message|\.ogg($|\?)/i.test(String(source?.assetUrl ?? source?.url ?? '')))
	const url = String(source?.assetUrl ?? source?.url ?? source?.uri ?? '')
	return voice ? { title: 'Voice message', subtitle: 'Discord' } : { title: url ? titleOf(url) : 'Audio', subtitle: 'Discord' }
}

function reportNative(): void {
	if (!nativeSource) return
	const { title, subtitle } = nativeTitle(nativeSource)
	if (!on('notification')) return
	sendUpdate({
		target: 'native',
		title,
		subtitle,
		durationMs: nativeDuration > 0 ? Math.round(toMs(nativeDuration, nativeDuration)) : -1,
		positionMs: Math.round(toMs(nativeTime, nativeDuration)),
		playing: nativeRate !== 0,
		canSeek: false,
	})
}

function startNativePlayer(cleanup: Cleanup): NativePlayerModule | undefined {
	const module = (NativeModules as Record<string, any>).MediaPlayerManager as NativePlayerModule | undefined
	if (!module) {
		found('native MediaPlayerManager', 'not in this build')
		return undefined
	}
	found('native MediaPlayerManager', Object.keys(module).filter(k => typeof (module as any)[k] === 'function').join(',') || 'found')
	try {
		const emitter = new NativeEventEmitter(module as never)
		const subs = [
			emitter.addListener('MediaPlayerPlaybackSourceChanged', (event: any) => {
				nativeSource = event?.source ?? null
				if (!nativeSource) clearMedia('native')
				count('native source changed')
			}),
			emitter.addListener('MediaPlayerPlaybackRateChanged', (event: any) => {
				if (event?.source) nativeSource = event.source
				nativeRate = Number(event?.rate) || 0
				reportNative()
			}),
			emitter.addListener('MediaPlayerPlaybackProgressUpdated', (event: any) => {
				if (event?.source) nativeSource = event.source
				nativeTime = Number(event?.time) || 0
				nativeDuration = Number(event?.duration) || nativeDuration
				if (!lastRaw) lastRaw = JSON.stringify({ time: event?.time, duration: event?.duration, source: Object.keys(event?.source ?? {}) }).slice(0, 200)
				if (Date.now() - nativeAt > 2000) {
					nativeAt = Date.now()
					reportNative()
				}
			}),
		]
		cleanup(() => subs.forEach(sub => sub.remove()))
	} catch (error) {
		note(`native player events: ${errorText(error)}`)
	}
	return module
}

/** Runs a command from the notification on Discord's native player. */
export function nativeCommand(module: NativePlayerModule | undefined, cmd: string): void {
	try {
		if (cmd === 'play') module?.playCurrentPlayer?.()
		else if (cmd === 'pause' || cmd === 'stop') module?.pauseCurrentPlayer?.()
	} catch (error) {
		note(`native ${cmd}: ${errorText(error)}`)
	}
}

export function nativeReport(): string {
	return `native player: ${nativeSource ? `${nativeRate !== 0 ? 'playing' : 'paused'} ${nativeTime}/${nativeDuration}` : 'nothing yet'}${lastRaw ? `, first progress ${lastRaw}` : ''}`
}

export function startAudio(cleanup: Cleanup): NativePlayerModule | undefined {
	startVoiceMessages(cleanup)
	return startNativePlayer(cleanup)
}
