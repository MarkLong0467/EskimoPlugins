import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { memoOf, typeNameFilter } from '../../../shared/palmdevs/finders'
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

/**
 * Makes calls use the preferred audio output device, and replaces the speaker button of the voice panel with one that opens
 * a list of the phone's devices.
 *
 * @returns What takes the patch off again.
 */
export function installRememberDevice(): () => void {
	const undo: Array<() => void> = []
	let found = false

	undo.push(
		getModules(
			typeNameFilter('VoicePanelHeaderSpeaker'),
			(exports: unknown) => {
				if (found) return
				const memo =
					memoOf<(props: SpeakerProps) => ReactElement | null>(exports)
				if (!memo || typeof memo.type !== 'function') {
					diag.log(
						'find',
						'VoicePanelHeaderSpeaker: found, but it is not a function component',
						'warn',
					)
					return
				}
				found = true
				state.speaker = true
				undo.push(
					diag.apply('VoicePanelHeaderSpeaker', () =>
						valenced.patcher.instead(memo, 'type', ((
							args: [SpeakerProps],
							original: (props: SpeakerProps) => ReactElement | null,
						) => {
							// Discord's own button is drawn first so that its hooks run on every draw.
							const own = original(...args)
							if (!args[0]?.isConnectedToVoiceChannel) return own
							const device = store.get('rememberOutputDevice').device
							if (!device) return own
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
						}) as never),
					),
				)
			},
		),
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
	}
}
