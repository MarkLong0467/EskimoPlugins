import { Dispatcher } from '@valenced/discord/common/flux'
import { getStore, Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { Vibration } from 'react-native'
import { minutes, minutesText, store } from './config'
import { toast } from './discord'

/**
 * The part that does the saving.
 *
 * What Discord does (decompiled Discord app, `stores/MediaEngineStore.tsx` and
 * `discord_common/js/packages/media-engine/native/Connection.tsx`): muting only calls `conn.setSelfMute(true)`, which stops
 * your voice being *sent*. The microphone keeps recording and every sound still goes through echo cancellation, noise
 * suppression, gain control and Krisp noise cancellation. Discord already has an option in its voice engine that skips
 * Krisp while muted (`skipNoiseCancellationIfMuted`, behind the `2026-08-mute-aware-noise-cancellation` experiment, which is
 * off for everyone): `updateConnectionMuteDeaf` calls `connection.setSkipNoiseCancellationIfMuted(experiment && muted)`.
 *
 * This plugin:
 * - turns that option on (the connection's method is patched so it is always asked for `true`),
 * - optionally turns the other processing off while muted, through the same connection setters Discord's settings use,
 *   and puts back exactly what Discord had (or what Discord asked for in the meantime) when you unmute,
 * - pauses other people's cameras while you are deafened with Discord's own "automatic" video toggle
 *   (`AUDIO_SET_LOCAL_VIDEO_DISABLED` with `isAutomatic`, as the video health manager does), which is not saved,
 * - counts how long you have been deafened (or muted) in a call, to remind you or leave the call.
 */

/** A Flux store with change listeners. */
interface ChangeStore {
	addChangeListener(listener: () => void): void
	removeChangeListener(listener: () => void): void
}

/** One of Discord's voice connections (`Connection.tsx`). Only the parts used here. */
interface Connection {
	context?: string
	destroyed?: boolean
	echoCancellation?: unknown
	noiseSuppression?: unknown
	noiseCancellation?: unknown
	automaticGainControl?: unknown
	setSkipNoiseCancellationIfMuted?(enabled: boolean): void
	setEchoCancellation?(value: unknown): void
	setNoiseSuppression?(value: unknown): void
	setNoiseCancellation?(value: unknown): void
	setAutomaticGainControl?(value: unknown): void
}

interface MediaEngine {
	eachConnection?(callback: (connection: Connection) => void): void
}

interface MediaEngineStore extends ChangeStore {
	isSelfMute(): boolean
	isSelfDeaf(): boolean
	getMediaEngine?(): MediaEngine | undefined
	isLocalVideoDisabled?(userId: string): boolean
}

interface VoiceChannelStore extends ChangeStore {
	getVoiceChannelId(): string | null | undefined
}

interface VoiceState {
	userId?: string
	selfVideo?: boolean
}

interface VoiceStateStore extends ChangeStore {
	getVoiceStatesForChannel?(
		channelId: string,
	): Record<string, VoiceState> | VoiceState[] | undefined
}

interface UserStore {
	getCurrentUser?(): { id?: string } | undefined
}

/** The mic processing that can be paused, with the connection setter of each. */
const PROCESSING = [
	['echoCancellation', 'setEchoCancellation'],
	['noiseSuppression', 'setNoiseSuppression'],
	['noiseCancellation', 'setNoiseCancellation'],
	['automaticGainControl', 'setAutomaticGainControl'],
] as const

type ProcessingKey = (typeof PROCESSING)[number][0]
type Setter = (typeof PROCESSING)[number][1]

/** The "default" voice connection (the call), as opposed to a Go Live stream's. */
const DEFAULT_CONTEXT = 'default'

/** What happened, for the settings screen and the report. */
export const state = {
	/** The stores were found. */
	media: false,
	voice: false,
	voiceStates: false,
	/** The connection's methods are patched. */
	patched: false,
	/** In a call right now, and muted / deafened. */
	inCall: false,
	muted: false,
	deafened: false,
	/** Whether the processing is paused right now. */
	processingPaused: false,
	/** How many times things were done. */
	skipKrispApplied: 0,
	processingPauses: 0,
	videosPaused: 0,
	reminders: 0,
	leaves: 0,
	/** When the timer started counting (0 when not). */
	countingSince: 0,
	/** Total time spent with the processing paused, in ms (this session). */
	pausedMs: 0,
	pausedSince: 0,
	/** The last error from the voice engine side. */
	lastError: '',
}

let media: MediaEngineStore | undefined
let voice: VoiceChannelStore | undefined
let voiceStates: VoiceStateStore | undefined

/** The values Discord had (or asked for while paused), to put back on unmute. */
let saved: Partial<Record<ProcessingKey, unknown>> = {}
/** True while the plugin itself calls a setter, so its own patch lets the call through. */
let bypass = false
/** The users whose camera this plugin paused. */
const pausedVideos = new Set<string>()
/** Whether a reminder was given for the current stretch. */
let reminded = false
let patchedPrototypes = new WeakSet<object>()
/** Whether the skip option was turned on by this plugin, so turning the setting off can turn it back off. */
let skipOn = false
const unpatches: Array<() => void> = []

/** The voice connections of the call (not Go Live streams). */
function connections(): Connection[] {
	const list: Connection[] = []
	try {
		media?.getMediaEngine?.()?.eachConnection?.(c => {
			if (
				c &&
				!c.destroyed &&
				(c.context ?? DEFAULT_CONTEXT) === DEFAULT_CONTEXT
			)
				list.push(c)
		})
	} catch (error) {
		state.lastError = String((error as Error)?.message ?? error)
	}
	return list
}

/** Calls one of the connection's own setters, past this plugin's patch. */
function raw(
	connection: Connection,
	setter: Setter | 'setSkipNoiseCancellationIfMuted',
	value: unknown,
): void {
	const fn = connection[setter] as ((v: unknown) => void) | undefined
	if (typeof fn !== 'function') return
	bypass = true
	try {
		fn.call(connection, value)
	} catch (error) {
		state.lastError = String((error as Error)?.message ?? error)
	} finally {
		bypass = false
	}
}

/**
 * Patches the methods of Discord's connection class (found from a live connection, so no module search is needed):
 * - `setSkipNoiseCancellationIfMuted` is always asked for `true` while the setting is on (it only acts while muted),
 * - each processing setter, while paused, keeps what Discord asked for to put back later instead of applying it.
 */
function patchConnection(connection: Connection): void {
	const proto = Object.getPrototypeOf(connection) as Record<
		string,
		(...args: unknown[]) => unknown
	> | null
	if (!proto || patchedPrototypes.has(proto)) return
	patchedPrototypes.add(proto)
	if (typeof proto.setSkipNoiseCancellationIfMuted === 'function')
		unpatches.push(
			instead(
				proto,
				'setSkipNoiseCancellationIfMuted',
				function (this: unknown, args, original) {
					const asked = !!args[0]
					return original.apply(this, [store.get('skipKrisp') ? true : asked])
				},
			),
		)
	for (const [key, setter] of PROCESSING) {
		if (typeof proto[setter] !== 'function') continue
		unpatches.push(
			instead(proto, setter, function (this: unknown, args, original) {
				if (state.processingPaused && !bypass) {
					// Discord changed this setting while it is paused: keep it for later.
					saved[key] = args[0]
					return undefined
				}
				return original.apply(this, args)
			}),
		)
	}
	state.patched = true
}

/** The value that turns one kind of processing off. Gain control is an object with `enabled` on newer builds. */
function offValue(key: ProcessingKey, current: unknown): unknown {
	if (key === 'automaticGainControl' && current && typeof current === 'object')
		return { ...(current as object), enabled: false }
	return false
}

/** Turns the processing off and remembers what it was. */
function pauseProcessing(list: Connection[]): void {
	const first = list[0]
	if (!first || state.processingPaused) return
	saved = {}
	for (const [key] of PROCESSING) saved[key] = first[key]
	for (const connection of list)
		for (const [key, setter] of PROCESSING)
			if (saved[key] !== undefined)
				raw(connection, setter, offValue(key, saved[key]))
	state.processingPaused = true
	state.pausedSince = Date.now()
	state.processingPauses++
}

/** Puts the processing back as Discord wants it. */
function resumeProcessing(list: Connection[]): void {
	if (!state.processingPaused) return
	state.processingPaused = false
	if (state.pausedSince) state.pausedMs += Date.now() - state.pausedSince
	state.pausedSince = 0
	for (const connection of list)
		for (const [key, setter] of PROCESSING)
			if (saved[key] !== undefined) raw(connection, setter, saved[key])
	saved = {}
}

/** The ids of the people in the call with their camera on, not counting you. */
function camerasInCall(channelId: string): string[] {
	let me: string | undefined
	try {
		me = getStoreNow<UserStore>('UserStore')?.getCurrentUser?.()?.id
	} catch {
		// Without your id, your own camera is left out by Discord anyway (you do not receive it).
	}
	const states = voiceStates?.getVoiceStatesForChannel?.(channelId)
	if (!states) return []
	const list = Array.isArray(states)
		? states
		: Object.entries(states).map(([id, s]) => ({
				...s,
				userId: s?.userId ?? id,
			}))
	return list
		.filter(s => s?.selfVideo && s.userId && s.userId !== me)
		.map(s => s.userId as string)
}

/** Shows or hides one person's camera with Discord's automatic (unsaved) toggle. */
function setVideo(userId: string, show: boolean): void {
	Dispatcher.dispatch({
		type: 'AUDIO_SET_LOCAL_VIDEO_DISABLED',
		context: DEFAULT_CONTEXT,
		userId,
		videoToggleState: show ? 'AUTO_ENABLED' : 'DISABLED',
		persist: false,
		isAutomatic: true,
	})
}

/** Pauses the cameras of people who turned theirs on, while deafened. */
function pauseVideos(channelId: string): void {
	for (const id of camerasInCall(channelId)) {
		if (pausedVideos.has(id)) continue
		// A camera you turned off yourself is yours to turn back on: it is not touched.
		if (media?.isLocalVideoDisabled?.(id)) continue
		setVideo(id, false)
		pausedVideos.add(id)
		state.videosPaused++
	}
}

/** Shows again the cameras this plugin paused (unless you changed them yourself in the meantime). */
function resumeVideos(): void {
	for (const id of pausedVideos)
		if (media?.isLocalVideoDisabled?.(id) !== false) setVideo(id, true)
	pausedVideos.clear()
}

/** Leaves the call, as Discord's disconnect button does. */
function disconnect(): boolean {
	const [actions] = lookupModule(
		withProps<{
			selectVoiceChannel(id: string | null): void
			disconnect(): void
		}>('selectVoiceChannel', 'disconnect'),
	)
	if (typeof actions?.disconnect !== 'function') return false
	actions.disconnect()
	return true
}

/** Looks at the timers. Called by the interval and after each change. */
export function tick(now = Date.now()): void {
	const counting =
		state.inCall &&
		(store.get('timerWhen') === 'muted' ? state.muted : state.deafened)
	if (!counting) {
		state.countingSince = 0
		reminded = false
		return
	}
	if (!state.countingSince) state.countingSince = now
	const elapsed = now - state.countingSince
	const what = store.get('timerWhen') === 'muted' ? 'muted' : 'deafened'
	const leave = minutes('leaveMinutes')
	if (leave && elapsed >= leave * 60_000) {
		state.countingSince = 0
		reminded = false
		if (disconnect()) {
			state.leaves++
			toast(`Left the call after ${minutesText(leave)} ${what}`)
			buzz()
		}
		return
	}
	const remind = minutes('remindMinutes')
	if (remind && !reminded && elapsed >= remind * 60_000) {
		reminded = true
		state.reminders++
		toast(`You have been ${what} in a call for ${minutesText(remind)}`)
		buzz()
	}
}

/** A short double vibration. */
function buzz(): void {
	try {
		Vibration.vibrate([0, 80, 120, 80])
	} catch {
		// No vibration on this phone.
	}
}

/** Makes everything match the call, the mute state and the settings. */
export function sync(): void {
	const channelId = voice?.getVoiceChannelId() ?? null
	state.inCall = !!channelId
	state.deafened = !!media?.isSelfDeaf()
	state.muted = !!media?.isSelfMute() || state.deafened
	const list = connections()
	for (const c of list) patchConnection(c)

	if (store.get('skipKrisp') && list.length) {
		for (const c of list) raw(c, 'setSkipNoiseCancellationIfMuted', true)
		skipOn = true
		state.skipKrispApplied++
	} else if (skipOn && list.length) {
		// Discord's own value: the experiment is off, so it asks for `false`.
		for (const c of list) raw(c, 'setSkipNoiseCancellationIfMuted', false)
		skipOn = false
	}

	if (state.inCall && state.muted && store.get('pauseProcessing'))
		pauseProcessing(list)
	else resumeProcessing(list)

	if (channelId && state.deafened && store.get('pauseVideo'))
		pauseVideos(channelId)
	else if (pausedVideos.size) resumeVideos()

	tick()
}

/** The last mute/deafen/call state, so a change that does not touch it does no work. */
let lastKey = ''
let timer: ReturnType<typeof setTimeout> | undefined
/** Whether one of the calls waiting for the timer asked for a full sync. */
let forced = false

/**
 * Runs {@link sync} soon. Store listeners are called in the middle of a Flux dispatch, and dispatching from there throws
 * ("Cannot dispatch in the middle of a dispatch"), so the work always waits for the dispatch to end.
 */
export function schedule(force = false): void {
	forced ||= force
	if (timer) return
	timer = setTimeout(() => {
		timer = undefined
		const force = forced
		forced = false
		const key = `${voice?.getVoiceChannelId() ?? ''}|${!!media?.isSelfMute()}|${!!media?.isSelfDeaf()}|${connections().length}`
		if (
			!force &&
			key === lastKey &&
			!(state.deafened && store.get('pauseVideo'))
		)
			return
		lastKey = key
		try {
			sync()
		} catch (error) {
			state.lastError = String((error as Error)?.message ?? error)
		}
	}, 30)
}

/** A store that is already there, or nothing. */
function getStoreNow<T>(name: string): T | undefined {
	try {
		return (Stores as unknown as Record<string, T | undefined>)[name]
	} catch {
		return undefined
	}
}

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** Starts watching the call. */
export function startEngine(cleanup: Cleanup): void {
	const onChange = () => schedule()
	const watch = <T extends ChangeStore>(name: string, keep: (s: T) => void) =>
		getStore<T>(name, s => {
			keep(s as unknown as T)
			s.addChangeListener(onChange)
			cleanup(() => s.removeChangeListener(onChange))
			schedule(true)
		})
	cleanup(
		watch<MediaEngineStore>('MediaEngineStore', s => {
			media = s
			state.media = true
		}),
		watch<VoiceChannelStore>('SelectedVoiceChannelStore', s => {
			voice = s
			state.voice = true
		}),
		watch<VoiceStateStore>('VoiceStateStore', s => {
			voiceStates = s
			state.voiceStates = true
		}),
	)
	const interval = setInterval(() => {
		try {
			tick()
		} catch (error) {
			state.lastError = String((error as Error)?.message ?? error)
		}
	}, 20_000)
	cleanup(() => clearInterval(interval))
	cleanup(stopEngine)
}

/** Puts everything back as Discord had it. */
export function stopEngine(): void {
	if (timer) clearTimeout(timer)
	timer = undefined
	const list = connections()
	try {
		resumeProcessing(list)
	} catch {
		// Discord puts its settings back the next time it applies them.
	}
	try {
		if (pausedVideos.size) resumeVideos()
	} catch {
		pausedVideos.clear()
	}
	for (const unpatch of unpatches.splice(0)) unpatch()
	// Discord's own value: the experiment is off, so it asks for `false`.
	if (skipOn)
		for (const c of list) raw(c, 'setSkipNoiseCancellationIfMuted', false)
	skipOn = false
	patchedPrototypes = new WeakSet<object>()
	media = voice = voiceStates = undefined
	lastKey = ''
	reminded = false
	state.patched = state.media = state.voice = state.voiceStates = false
	state.countingSince = 0
}

/** Whether there is a call connection to work on right now. */
export function hasConnection(): boolean {
	return connections().length > 0
}
