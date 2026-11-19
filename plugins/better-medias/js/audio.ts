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
import { clearMedia, openMini, sendNativeSource, sendNativeVideo, sendUpdate, setPip } from './native'
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
 * - It plays one thing at a time. With "Play several at once" on, what was playing carries on in the plugin's small player when
 *   something else starts; a chat video left by changing chats carries on there too, so it can be seen.
 * - Seeking: see nativeSeek below.
 */
interface NativePlayerModule {
	playCurrentPlayer?: () => void
	pauseCurrentPlayer?: () => void
	pauseAllMediaPlayers?: (...args: unknown[]) => unknown
	changeProgress?: (id: unknown, value: number) => unknown
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
let appActive = true
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
const canSeek = () => typeof nativeModule?.changeProgress === 'function' && nativeSource?.id != null

function reportNative(): void {
	if (!nativeSource) return
	updateNativePip()
	if (nativeKind === 'video') sendNativeVideo(urlOf(nativeSource), nativeTimeMs, nativeTitle(nativeSource).title, playing())
	if (!on('notification')) return
	const { title, subtitle } = nativeTitle(nativeSource)
	sendUpdate({
		target: 'native',
		title,
		subtitle,
		durationMs: nativeDurationMs > 0 ? Math.round(nativeDurationMs) : -1,
		positionMs: Math.max(0, Math.round(nativeTimeMs)),
		playing: playing(),
		canSeek: canSeek(),
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
	appActive = state === 'active'
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

/** What the chat player plays carries on in the plugin's small player, and Discord's player is paused. */
function handToMini(reason: string): void {
	const url = urlOf(nativeSource)
	if (!url) return
	openMini(url, nativeTimeMs, nativeTitle(nativeSource).title, true)
	userPausedAt = Date.now()
	try {
		nativeModule?.pauseCurrentPlayer?.()
	} catch {}
	count(reason)
}

/**
 * Seeking Discord's chat player: `changeProgress(id: number, value: number)`. Neither the id nor the unit is documented. The
 * chat player's source id looks like "<message id>.<n>:<number>", so the numbers in it are tried, each in seconds,
 * milliseconds and as a fraction of the length. The first way that moves the player there is kept.
 */
type SeekWay = { id: 'after' | 'before' | 'portal'; unit: 's' | 'ms' | 'frac' }
const SEEK_WAYS: SeekWay[] = (['portal', 'after', 'before'] as const).flatMap(id => (['s', 'ms', 'frac'] as const).map(unit => ({ id, unit })))
let seekWay = 0
let seekWorks = false
let pendingSeek: { target: number; from: number; way: number; at: number; tries: number } | null = null

function seekId(source: any, way: SeekWay): number | undefined {
	if (way.id === 'portal') return typeof source?.portal === 'number' ? source.portal : undefined
	const id = String(source?.id ?? '')
	const part = way.id === 'after' ? id.split(':')[1] : id.split(':')[0]
	const value = part === undefined || part === '' ? NaN : Number(part)
	return Number.isFinite(value) ? value : undefined
}

/** Seeks Discord's chat player (see above). */
function nativeSeek(ms: number): void {
	if (!canSeek() || !(ms >= 0)) {
		note('seek: Discord’s chat player has no changeProgress here')
		return
	}
	pendingSeek = { target: ms, from: nativeTimeMs, way: seekWay, at: Date.now(), tries: 0 }
	trySeek()
}

/** Sends the pending seek the current way; ways that cannot even be sent (no such id, an error) are skipped at once. */
function trySeek(): void {
	const seek = pendingSeek
	if (!seek) return
	while (seek.tries < SEEK_WAYS.length) {
		const way = SEEK_WAYS[seek.way % SEEK_WAYS.length]!
		seek.tries++
		const id = seekId(nativeSource, way)
		const value = way.unit === 's' ? seek.target / 1000 : way.unit === 'ms' ? seek.target : nativeDurationMs > 0 ? seek.target / nativeDurationMs : NaN
		if (id !== undefined && Number.isFinite(value)) {
			try {
				nativeModule?.changeProgress?.(id, value)
				seek.at = Date.now()
				nativeTimeMs = seek.target
				reportedAt = 0
				return
			} catch (error) {
				note(`seek (${way.id} ${way.unit}): ${errorText(error).slice(0, 80)}`)
			}
		}
		seek.way = (seek.way + 1) % SEEK_WAYS.length
	}
	note(`seek: no way moved the player (id ${String(nativeSource?.id)})`)
	pendingSeek = null
}

/** After a seek: did the player land there? If not, the next way is tried. */
function checkSeek(): void {
	const seek = pendingSeek
	if (!seek) return
	const since = Date.now() - seek.at
	if (since < 250) return
	if (Math.abs(nativeTimeMs - seek.target) < 1500) {
		// Landing where it already was proves nothing; otherwise this way works.
		if (Math.abs(seek.from - seek.target) > 2500) {
			seekWay = seek.way
			const way = SEEK_WAYS[seek.way]!
			if (!seekWorks) count(`seek works (${way.id} ${way.unit})`)
			seekWorks = true
		}
		pendingSeek = null
		return
	}
	if (since < 1200) return
	if (seekWorks && seek.way === seekWay && seek.tries === 1) {
		// The way that worked before did not this time (another player?): look again.
		seekWorks = false
	}
	seek.way = (seek.way + 1) % SEEK_WAYS.length
	seek.from = nativeTimeMs
	trySeek()
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
			// A chat video would play on unseen in the chat that was left: it carries on in the small player instead.
			if (nativeKind === 'video' && playing()) handToMini('chat change: video to the small player')
			else count('chat change: kept playing')
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
			// Something else starts while one plays: with "Play several at once" on, the one before carries on in the small
			// player (Discord's player plays one thing at a time). Very short videos (GIF-like clips) are left alone; short voice
			// messages are not.
			const before = nativeSource
			const wasPlaying = !!before && (playing() || Date.now() - playingAt < 1500)
			if (wasPlaying && appActive && on('simultaneous') && (nativeKind !== 'video' || nativeDurationMs > 3000) && nativeDurationMs - nativeTimeMs > 300) {
				const url = urlOf(before)
				if (url) {
					openMini(url, nativeTimeMs, nativeTitle(before).title, true)
					count(`several at once: ${nativeKind} to the small player`)
				}
			}
			nativeDurationMs = 0
			nativeTimeMs = 0
			pendingSeek = null
			sendNativeSource(urlOf(source))
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
				checkSeek()
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
	appActive = AppState.currentState === 'active' || AppState.currentState == null
	const subscription = AppState.addEventListener('change', onAppState)
	cleanup(() => subscription.remove())
	cleanup(() => {
		nativeModule = undefined
		if (pipWanted) setPip(false, 16, 9, false, 'native')
		pipWanted = false
	})
	return module
}

/** Runs a command from the notification (or the native half) on Discord's native player. */
export function nativeCommand(module: NativePlayerModule | undefined, cmd: string, ms = -1): void {
	try {
		if (cmd === 'play') module?.playCurrentPlayer?.()
		else if (cmd === 'seek') nativeSeek(ms)
		else if (cmd === 'handoff') {
			// The small player took the video over for Picture-in-Picture.
			userPausedAt = Date.now()
			module?.pauseCurrentPlayer?.()
		}
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
	const way = SEEK_WAYS[seekWay]!
	const seek = canSeek() ? `seek via changeProgress (${seekWorks ? `${way.id} ${way.unit}` : 'way not found yet'})` : 'no seek'
	return `native player: ${state}, ${seek}${lastRaw ? `, first progress ${lastRaw}` : ''}`
}

export function startAudio(cleanup: Cleanup, inCall: () => boolean = () => false): NativePlayerModule | undefined {
	inCallNow = inCall
	startVoiceMessages(cleanup)
	return startNativePlayer(cleanup)
}
