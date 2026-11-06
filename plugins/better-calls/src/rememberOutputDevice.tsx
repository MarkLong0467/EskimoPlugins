import { Design } from '@valenced/discord/design'
import { installJsxFinder } from '../../../shared/palmdevs/jsxFind'
import { openAudioSheet } from './AudioSheet'
import { getAudioDeviceIcon, setAudioOutputDevice } from './audio'
import { store } from './config'
import { diag } from './diag'
import { state } from './state'
import type { ReactElement } from 'react'

/** What the speaker button of the voice panel is given, as far as this plugin reads it. */
interface SpeakerProps {
	isConnectedToVoiceChannel?: boolean
}

/** The function inside what Discord gave: the component itself, or the one a `React.memo` wraps. */
function innerFunction(
	type: unknown,
): ((props: SpeakerProps) => ReactElement | null) | undefined {
	if (typeof type === 'function')
		return type as (props: SpeakerProps) => ReactElement | null
	const inner = (type as { type?: unknown } | null)?.type
	return typeof inner === 'function'
		? (inner as (props: SpeakerProps) => ReactElement | null)
		: undefined
}

/**
 * What the speaker button draws: Discord's own outside a call, and in a call a button that opens the list of devices, after the
 * remembered device has been chosen.
 *
 * Discord's own button is drawn first so that its hooks run on every draw.
 */
function speaker(
	props: SpeakerProps,
	own: (props: SpeakerProps) => ReactElement | null,
): ReactElement | null {
	const drawn = own(props)
	if (!props?.isConnectedToVoiceChannel) return drawn
	const device = store.get('rememberOutputDevice').device
	if (!device) return drawn
	setAudioOutputDevice(device)
	state.deviceApplied++
	const icon = getAudioDeviceIcon(device.simpleDeviceType)
	return (
		<Design.IconButton
			key="better-calls:audio-output-device"
			icon={(icon ?? 0) as never}
			accessibilityLabel="Audio output device"
			onPress={() => openAudioSheet({ fromVoiceCall: true })}
			variant="primary-overlay"
			size="sm"
		/>
	)
}

/**
 * Makes calls use the preferred audio output device, and replaces the speaker button of the voice panel with one that opens
 * a list of the phone's devices.
 *
 * The speaker button is found by watching for `VoicePanelHeaderSpeaker` to be drawn (see `jsxFind.ts`), not by searching
 * Discord's modules. For each element the plugin's component is drawn in its place.
 *
 * @returns What takes the patch off again.
 */
export function installRememberDevice(): () => void {
	const undo: Array<() => unknown> = []
	const stand = new WeakMap<
		object,
		(props: SpeakerProps) => ReactElement | null
	>()

	state.jsxSpeaker = installJsxFinder(
		(...fns) => {
			undo.push(...fns)
		},
		[
			{
				name: 'VoicePanelHeaderSpeaker',
				seen: () => {
					state.speaker = true
					diag.log('found', 'VoicePanelHeaderSpeaker was drawn')
				},
				replace: type => {
					const own = innerFunction(type)
					if (!own) return undefined
					let made = stand.get(type as object)
					if (!made) {
						made = function RememberedDeviceSpeaker(props) {
							return speaker(props, own)
						}
						stand.set(type as object, made)
					}
					return made
				},
			},
		],
	)

	return () => {
		for (const fn of undo.splice(0)) {
			try {
				fn()
			} catch {
				// Taking a patch off must not stop the others.
			}
		}
		state.speaker = false
		state.jsxSpeaker = false
	}
}
