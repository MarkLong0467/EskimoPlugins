/**
 * Videos. Discord plays a video (the full-screen viewer, previews) with its `VideoComponent`
 * (components_native/common/Video.tsx), which draws react-native-video 5. That player already knows how to keep playing in the
 * background (`playInBackground`, `playWhenInactive`) and how to play alongside other sound (`disableFocus`,
 * `mixWithOthers`); Discord leaves those off and pauses a video whenever the app is not active. This file turns them on (each
 * with its own switch) and keeps track of every video that is drawn: its position, its length and whether it plays. That feeds
 * the notification, Picture-in-Picture, and the small player that takes over a video you leave while it plays.
 */
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { beforeJSX, insteadJSX } from '@valenced/react/jsx-runtime'
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { count, errorText, found, note } from './diag'
import { clearMedia, miniCommand, openMini, sendUpdate, setPip } from './native'
import { on } from './config'
import type { ComponentType, Ref } from 'react'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** Where Discord's video component is defined. */
const VIDEO_PATH = 'components_native/common/Video.tsx'
/** Discord's newer video switch: its own native player, or react-native-video. */
const SWITCH_PATH = 'modules/media_playback/native/Video.tsx'

/** One video that is drawn right now. */
export interface VideoEntry {
	id: string
	uri: string
	title: string
	/** Seconds. */
	time: number
	/** Seconds; 0 until it is loaded. */
	duration: number
	width: number
	height: number
	paused: boolean
	muted: boolean
	/** When the last progress came (Date.now()), which only comes while it plays. */
	lastProgress: number
	/** When it last started playing. */
	startedAt: number
	/** The react-native-video instance (has seek() and setNativeProps()). */
	player?: { seek?: (seconds: number) => void; setNativeProps?: (props: object) => void }
	/** Pauses (true) or plays (false) it from outside Discord's own buttons; null gives control back to Discord. */
	force?: (paused: boolean | null) => void
	lastSent: string
}

export const videos = new Map<string, VideoEntry>()
let nextId = 1
let inCallNow = () => false

/** Playing: not paused, and its progress is still coming in. Muted previews do not count. */
export function isPlaying(entry: VideoEntry): boolean {
	return !entry.paused && Date.now() - entry.lastProgress < 2500
}

const audible = (entry: VideoEntry) => !entry.muted && !!entry.uri

/** The file name of a video, for the notification. */
export function titleOf(uri: string): string {
	try {
		const path = uri.split('?')[0] ?? ''
		const name = decodeURIComponent(path.split('/').pop() ?? '')
		return name || 'Video'
	} catch {
		return 'Video'
	}
}

/** The video the notification and Picture-in-Picture follow: the one that started playing last. */
function leading(): VideoEntry | undefined {
	let best: VideoEntry | undefined
	for (const entry of videos.values()) {
		if (!audible(entry) || !isPlaying(entry)) continue
		if (!best || entry.startedAt > best.startedAt) best = entry
	}
	return best
}

/** Sends one video's state to the notification (only when something changed). */
function report(entry: VideoEntry, force = false): void {
	if (!audible(entry)) return
	const playing = isPlaying(entry)
	const state = {
		target: `video:${entry.id}`,
		title: entry.title,
		subtitle: 'Discord video',
		durationMs: entry.duration > 0 ? Math.round(entry.duration * 1000) : -1,
		positionMs: Math.round(entry.time * 1000),
		playing,
		canSeek: entry.duration > 0,
	}
	const key = `${playing}|${state.durationMs}|${Math.round(entry.time / 2)}`
	if (!force && key === entry.lastSent) return
	entry.lastSent = key
	// No notification while videos are not kept playing in the background: it would not work once Discord is left.
	if (on('notification') && on('backgroundVideo')) sendUpdate(state)
	else if (on('notification')) clearMedia(state.target)
	updatePip()
}

function updatePip(): void {
	const lead = leading()
	setPip(!!lead && on('pictureInPicture'), lead?.width || 16, lead?.height || 9, inCallNow(), 'js')
}

/** While Discord is open and several play at once is off, starting one pauses the others (and the small player). */
function onStarted(entry: VideoEntry): void {
	entry.startedAt = Date.now()
	if (on('simultaneous')) return
	for (const other of videos.values()) if (other !== entry && audible(other) && isPlaying(other)) other.force?.(true)
	miniCommand('pause')
}

/**
 * Discord going to the background with several things playing: only the one started last keeps going. The others are paused
 * and stay paused.
 */
function onBackground(): void {
	const playing = [...videos.values()].filter(entry => audible(entry) && isPlaying(entry))
	if (playing.length < 2) return
	playing.sort((a, b) => b.startedAt - a.startedAt)
	for (const entry of playing.slice(1)) entry.force?.(true)
	count('paused on leaving (more than one playing)')
}

/** A video that goes away while it plays (the viewer closed, another chat opened) carries on in the small player. */
const handovers = new Map<string, ReturnType<typeof setTimeout>>()
function onGone(entry: VideoEntry): void {
	const wasPlaying = audible(entry) && isPlaying(entry) && entry.duration > 1
	clearMedia(`video:${entry.id}`)
	if (!wasPlaying || !on('crossChat')) {
		updatePip()
		return
	}
	// Discord sometimes draws the same video again right away (a re-render): wait a moment and only hand over if it did not.
	const uri = entry.uri
	const at = entry.time
	clearTimeout(handovers.get(uri))
	handovers.set(
		uri,
		setTimeout(() => {
			handovers.delete(uri)
			for (const other of videos.values()) if (other.uri === uri) return
			openMini(uri, at * 1000, entry.title, true)
			count('handed to the small player')
			updatePip()
		}, 400),
	)
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null): void {
	if (typeof ref === 'function') ref(value)
	else if (ref && typeof ref === 'object') (ref as { current: T | null }).current = value
}

/** Wraps one react-native-video player: it is drawn as Discord asked, with the tracking and the switches added. */
function Tracked(all: Record<string, any>) {
	const { __bmType: Type, __bmRef: outerRef, ...props } = all
	const holder = useRef<VideoEntry | null>(null)
	if (!holder.current) {
		holder.current = {
			id: String(nextId++),
			uri: '',
			title: 'Video',
			time: 0,
			duration: 0,
			width: 16,
			height: 9,
			paused: true,
			muted: true,
			lastProgress: 0,
			startedAt: 0,
			lastSent: '',
		}
	}
	const entry = holder.current
	const [forced, setForced] = useState<boolean | null>(null)
	entry.force = setForced
	// Discord's own play and pause buttons win again as soon as they change.
	useEffect(() => {
		if (forced !== null) setForced(null)
	}, [props.paused])
	const paused = forced ?? !!props.paused
	const wasPaused = entry.paused
	entry.paused = paused
	entry.muted = !!props.muted
	entry.uri = typeof props.source?.uri === 'string' ? props.source.uri : ''
	entry.title = titleOf(entry.uri)

	useEffect(() => {
		videos.set(entry.id, entry)
		const pending = handovers.get(entry.uri)
		if (pending) {
			clearTimeout(pending)
			handovers.delete(entry.uri)
		}
		return () => {
			videos.delete(entry.id)
			onGone(entry)
		}
	}, [])

	useEffect(() => {
		if (wasPaused && !paused && audible(entry)) onStarted(entry)
		report(entry, true)
	}, [paused])

	const ref = useCallback(
		(instance: VideoEntry['player'] | null) => {
			entry.player = instance ?? undefined
			setRef(outerRef, instance)
		},
		[outerRef],
	)

	const background = on('backgroundVideo')
	const together = on('simultaneous')
	return createElement(Type, {
		...props,
		ref,
		paused,
		playInBackground: background || !!props.playInBackground,
		playWhenInactive: background || !!props.playWhenInactive,
		disableFocus: together || !!props.disableFocus,
		mixWithOthers: together ? 'mix' : props.mixWithOthers,
		onLoad: (event: any) => {
			entry.duration = Number(event?.duration) || entry.duration
			const size = event?.naturalSize
			if (size?.width > 0 && size?.height > 0) {
				entry.width = size.width
				entry.height = size.height
			}
			report(entry, true)
			props.onLoad?.(event)
		},
		onProgress: (event: any) => {
			const before = entry.time
			entry.time = Number(event?.currentTime) || 0
			if (entry.time !== before) {
				const started = !isPlaying(entry)
				entry.lastProgress = Date.now()
				if (started && audible(entry)) onStarted(entry)
			}
			if (!entry.duration && Number(event?.seekableDuration) > 0) entry.duration = Number(event.seekableDuration)
			report(entry)
			props.onProgress?.(event)
		},
		onEnd: (event: any) => {
			entry.lastProgress = 0
			report(entry, true)
			props.onEnd?.(event)
		},
	})
}

/** Runs a command from the notification on a video. */
export function command(id: string, cmd: string, ms: number): boolean {
	const entry = videos.get(id)
	if (!entry) return false
	if (cmd === 'play') {
		entry.force?.(false)
		entry.lastProgress = Date.now()
	} else if (cmd === 'pause' || cmd === 'stop') {
		entry.force?.(true)
		entry.lastProgress = 0
	} else if (cmd === 'seek' && ms >= 0) {
		try {
			entry.player?.seek?.(ms / 1000)
			entry.time = ms / 1000
		} catch (error) {
			note(`seek: ${errorText(error)}`)
		}
	}
	setTimeout(() => report(entry, true), 300)
	return true
}

export function startVideos(cleanup: Cleanup, inCall: () => boolean): void {
	inCallNow = inCall
	// 1. Discord's VideoComponent: it pauses a video whenever the app is not active (pauseWhileAppInactive, on by default).
	cleanup(
		getModuleWithImportedPath<{ VideoComponent?: ComponentType<any> }>(VIDEO_PATH, module => {
			const VideoComponent = module?.VideoComponent
			if (!VideoComponent) {
				found('VideoComponent', 'module loaded, no VideoComponent')
				return
			}
			found('VideoComponent', 'found')
			cleanup(
				beforeJSX(VideoComponent, ([type, props, key]) => {
					if (!props || !on('backgroundVideo')) return [type, props, key]
					count('videos drawn')
					return [type, { ...props, pauseWhileAppInactive: false, playInBackground: true }, key]
				}),
			)
		}),
	)

	// 2. Discord's video switch (modules/media_playback/native/Video.tsx) draws its own native player or react-native-video,
	// with the same props either way: wrapping it covers both.
	let switchWrapped = false
	cleanup(
		getModuleWithImportedPath<{ default?: ComponentType<any> }>(SWITCH_PATH, module => {
			const Switch = module?.default
			if (!Switch) {
				found('media playback Video', 'module loaded, no default')
				return
			}
			switchWrapped = true
			found('media playback Video', 'found')
			cleanup(
				insteadJSX(Switch, ([type, props, key], jsx) => {
					if (!props) return jsx(type, props as never, key)
					const { ref, ...rest } = props as Record<string, any>
					return jsx(Tracked as never, { ...rest, __bmType: type, __bmRef: ref } as never, key)
				}),
				() => {
					switchWrapped = false
				},
			)
		}),
	)

	// 3. react-native-video's player (older builds): tracked, and given the background and side-by-side switches.
	try {
		const [module] = lookupModule(withProps('TextTrackType', 'FilterType', 'DRMType'))
		const RNVideo = (module as { default?: ComponentType<any> } | undefined)?.default
		if (!RNVideo) found('react-native-video', 'not found (fine when the media playback Video is found)')
		else {
			found('react-native-video', 'found')
			cleanup(
				insteadJSX(RNVideo, ([type, props, key], jsx) => {
					// Already wrapped one level up (Discord's video switch).
					if (!props || switchWrapped) return jsx(type, props as never, key)
					const { ref, ...rest } = props as Record<string, any>
					return jsx(Tracked as never, { ...rest, __bmType: type, __bmRef: ref } as never, key)
				}),
			)
		}
	} catch (error) {
		found('react-native-video', `error: ${errorText(error)}`)
	}

	const subscription = AppState.addEventListener('change', state => {
		if (state === 'background' && on('simultaneous')) onBackground()
	})
	cleanup(() => subscription.remove())
	cleanup(() => {
		for (const timer of handovers.values()) clearTimeout(timer)
		handovers.clear()
		for (const entry of videos.values()) entry.force?.(null)
		setPip(false, 16, 9, false, 'js')
	})
}
