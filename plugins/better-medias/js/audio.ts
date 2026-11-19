/**
 * Voice messages and audio files.
 *
 * Voice messages: Discord's `VoiceMessagesPlaybackManager` listens for APP_STATE_UPDATE and, on Android, tells its native
 * audio player to pause when Discord leaves the screen (and to play again when it comes back). With "Voice messages" on, that
 * one listener is swapped for one that skips it; every other part of Discord still hears APP_STATE_UPDATE.
 *
 * Media inside chats (audio files, voice messages and videos are played by Discord's native player): see below.
 */
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { AppState, NativeEventEmitter, NativeModules } from 'react-native'
import { count, errorText, found, note } from './diag'
import { clearMedia, sendUpdate, setPip } from './native'
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

/**
 * Discord's native player for media inside chats: audio files, voice messages and videos all play through it, one at a time.
 * - It reports times in milliseconds.
 * - Discord tells it to pause everything whenever another chat opens (`pauseAllMediaPlayers`): with "Keep videos playing
 *   across chats" on, that call is skipped (here, and in the native half if this object cannot be changed).
 * - It pauses itself a few milliseconds after Discord leaves the screen. Playing it again right away works (that is what the
 *   notification's play button does), so when it was playing as Discord left, it is started again.
 */
interface NativePlayerModule {
	playCurrentPlayer?: () => void
	pauseCurrentPlayer?: () => void
	pauseAllMediaPlayers?: (...args: unknown[]) => unknown
}

export type NativeKind = 'voice' | 'video' | 'audio'

const VIDEO_FILE = /\.(mp4|mov|webm|m4v|mkv|3gp)$/i
const AUDIO_SETTING = { voice: 'backgroundVoice', video: 'backgroundVideo', audio: 'backgroundAudio' } as const

let nativeModule: NativePlayerModule | undefined
let nativeSource: any
let nativeKind: NativeKind = 'audio'
let nativeRate = 0
let nativeTimeMs = 0
let nativeDurationMs = 0
let reportedAt = 0
/** When it was last seen playing. */
let playingAt = 0
/** When Discord left the screen (0 while it is open), and whether something played then. */
let leftAt = 0
let leftWhilePlaying = false
let resumes = 0
/** When pause was last pressed in the notification (that pause is meant, it is not undone). */
let userPausedAt = 0
let pipWanted = false
let lastRaw = ''
let inCallNow = () => false

const urlOf = (source: any) => String(source?.assetUrl ?? source?.url ?? source?.uri ?? '')

/** What the chat player is playing: a voice message, a video or an audio file. */
export function kindOf(source: any): NativeKind {
	if (!source) return 'audio'
	const path = urlOf(source).split('?')[0] ?? ''
	if (source.isVoiceMessage ?? /voice-message|\.ogg$/i.test(path)) return 'voice'
	const type = String(source.contentType ?? source.content_type ?? source.mediaType ?? source.type ?? '')
	if (/video/i.test(type) || VIDEO_FILE.test(path)) return 'video'
	return 'audio'
}

function nativeTitle(source: any): { title: string; subtitle: string } {
	if (nativeKind === 'voice') return { title: 'Voice message', subtitle: 'Discord' }
	const url = urlOf(source)
	return { title: url ? titleOf(url) : nativeKind === 'video' ? 'Video' : 'Audio', subtitle: 'Discord' }
}

const playing = () => nativeRate !== 0

function reportNative(): void {
	if (!nativeSource) return
	updateNativePip()
	if (!on('notification')) return
	const { title, subtitle } = nativeTitle(nativeSource)
	sendUpdate({
		target: 'native',
		title,
		subtitle,
		durationMs: nativeDurationMs > 0 ? Math.round(nativeDurationMs) : -1,
		positionMs: Math.max(0, Math.round(nativeTimeMs)),
		playing: playing(),
		// The native half decides: it can seek when it found the player behind Discord's.
		canSeek: false,
	})
}

/** A video playing in a chat: Picture-in-Picture when Discord is left. */
function updateNativePip(): void {
	const wanted = nativeKind === 'video' && playing() && on('pictureInPicture')
	if (wanted === pipWanted) return
	pipWanted = wanted
	setPip(wanted, 16, 9, inCallNow(), 'native')
}

/** Starts the chat player again after Discord paused it for leaving the screen. */
function resumeAfterLeaving(): void {
	const now = Date.now()
	if (!leftAt || !leftWhilePlaying || resumes >= 3 || now - leftAt > 4000) return
	if (!on(AUDIO_SETTING[nativeKind]) || inCallNow() || now - userPausedAt < 4000) return
	if (nativeDurationMs > 0 && nativeDurationMs - nativeTimeMs < 1000) return // it simply reached the end
	resumes++
	try {
		nativeModule?.playCurrentPlayer?.()
		count(`kept playing after leaving (${nativeKind})`)
	} catch (error) {
		note(`resume: ${errorText(error)}`)
	}
}

function onAppState(state: string): void {
	if (state === 'active') {
		leftAt = 0
		return
	}
	if (leftAt) return
	leftAt = Date.now()
	resumes = 0
	leftWhilePlaying = playing() || leftAt - playingAt < 1500
	if (leftWhilePlaying && !playing()) resumeAfterLeaving()
}

/** Discord pauses every chat player when another chat opens; with "across chats" on, that is skipped. */
function keepAcrossChats(module: NativePlayerModule, cleanup: Cleanup): void {
	const original = module.pauseAllMediaPlayers
	if (typeof original !== 'function') {
		found('pause on chat change', 'not in this build')
		return
	}
	const instead = function (this: unknown, ...args: unknown[]) {
		if (on('crossChat')) {
			count('chat change: kept playing')
			return undefined
		}
		return original.apply(this, args)
	}
	try {
		module.pauseAllMediaPlayers = instead
	} catch {}
	const patched = module.pauseAllMediaPlayers === instead
	found('pause on chat change', patched ? 'patched' : 'read-only here (the native half skips it)')
	if (patched)
		cleanup(() => {
			try {
				module.pauseAllMediaPlayers = original
			} catch {}
		})
}

function startNativePlayer(cleanup: Cleanup): NativePlayerModule | undefined {
	const module = (NativeModules as Record<string, any>).MediaPlayerManager as NativePlayerModule | undefined
	if (!module) {
		found('native MediaPlayerManager', 'not in this build')
		return undefined
	}
	nativeModule = module
	found('native MediaPlayerManager', Object.keys(module).filter(k => typeof (module as any)[k] === 'function').join(',') || 'found')
	keepAcrossChats(module, cleanup)
	const setSource = (source: any) => {
		if (!source) return
		if (source.id !== nativeSource?.id || urlOf(source) !== urlOf(nativeSource)) {
			nativeDurationMs = 0
			nativeTimeMs = 0
		}
		nativeSource = source
		nativeKind = kindOf(source)
	}
	try {
		const emitter = new NativeEventEmitter(module as never)
		const subs = [
			emitter.addListener('MediaPlayerPlaybackSourceChanged', (event: any) => {
				if (!event?.source) {
					nativeSource = null
					nativeRate = 0
					clearMedia('native')
					updateNativePip()
				} else setSource(event.source)
				count('native source changed')
			}),
			emitter.addListener('MediaPlayerPlaybackRateChanged', (event: any) => {
				setSource(event?.source)
				nativeRate = Number(event?.rate) || 0
				if (playing()) playingAt = Date.now()
				reportNative()
				if (!playing()) resumeAfterLeaving()
			}),
			emitter.addListener('MediaPlayerPlaybackProgressUpdated', (event: any) => {
				setSource(event?.source)
				nativeTimeMs = Number(event?.time) || 0
				nativeDurationMs = Number(event?.duration) || nativeDurationMs
				if (playing()) playingAt = Date.now()
				if (!lastRaw && Number(event?.duration) > 0)
					lastRaw = JSON.stringify({ time: event?.time, duration: event?.duration, source: Object.keys(event?.source ?? {}) }).slice(0, 240)
				if (Date.now() - reportedAt > 2000) {
					reportedAt = Date.now()
					reportNative()
				}
			}),
		]
		cleanup(() => subs.forEach(sub => sub.remove()))
	} catch (error) {
		note(`native player events: ${errorText(error)}`)
	}
	const subscription = AppState.addEventListener('change', onAppState)
	cleanup(() => subscription.remove())
	cleanup(() => {
		nativeModule = undefined
		if (pipWanted) setPip(false, 16, 9, false, 'native')
		pipWanted = false
	})
	return module
}

/** Runs a command from the notification on Discord's native player (seeking is done by the native half). */
export function nativeCommand(module: NativePlayerModule | undefined, cmd: string): void {
	try {
		if (cmd === 'play') module?.playCurrentPlayer?.()
		else if (cmd === 'pause' || cmd === 'stop') {
			userPausedAt = Date.now()
			module?.pauseCurrentPlayer?.()
		}
	} catch (error) {
		note(`native ${cmd}: ${errorText(error)}`)
	}
}

export function nativeReport(): string {
	const state = nativeSource ? `${nativeKind} ${playing() ? 'playing' : 'paused'} ${nativeTimeMs}/${nativeDurationMs} ms` : 'nothing yet'
	return `native player: ${state}${lastRaw ? `, first progress ${lastRaw}` : ''}`
}

export function startAudio(cleanup: Cleanup, inCall: () => boolean = () => false): NativePlayerModule | undefined {
	inCallNow = inCall
	startVoiceMessages(cleanup)
	return startNativePlayer(cleanup)
}
