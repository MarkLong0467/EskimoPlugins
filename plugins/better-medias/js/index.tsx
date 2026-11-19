/*
 * Better Medias for Valenced, by MarkLong0467. Background playback for videos, audio files and voice messages, notification
 * controls, Picture-in-Picture, several things playing at once while Discord is open, and videos that keep playing while you
 * move between chats. The native half (notification, small player, Picture-in-Picture, hooks) is
 * source/android/marklong/bettermedias/BetterMedias.java.
 */
import { getStore } from '@valenced/discord/flux'
import { startAudio, nativeCommand } from './audio'
import { note } from './diag'
import { call, sendConfig } from './native'
import Settings from './Settings'
import { defaults, setStorage } from './config'
import { command, startVideos } from './videos'
import type { MediaSettings } from './config'

interface VoiceChannelStore {
	getVoiceChannelId(): string | null | undefined
}

let running = false
let voiceStore: VoiceChannelStore | undefined
const inCall = () => {
	try {
		return !!voiceStore?.getVoiceChannelId()
	} catch {
		return false
	}
}

/** Commands from the notification: "play:<target>", "pause:<target>", "seek:<target>:<ms>", "stop:<target>". */
async function listen(nativePlayer: ReturnType<typeof startAudio>): Promise<void> {
	while (running) {
		const action = await call('nextAction', [])
		if (!running || action === 'stop') return
		if (action === undefined) {
			// The native half is not there (or not yet): try again later.
			await new Promise(resolve => setTimeout(resolve, 5000))
			continue
		}
		if (!action || action === 'none') continue
		try {
			const [cmd, kind, id, ms] = action.split(':')
			if (kind === 'video' && id) command(id, cmd ?? '', Number(ms ?? -1))
			else if (kind === 'native') nativeCommand(nativePlayer, cmd ?? '')
		} catch (error) {
			note(`command ${action}: ${String(error)}`)
		}
	}
}

export default plugin<{ jsonStorage: MediaSettings }>({
	jsonStorage: {
		load: true,
		default: defaults,
	},
	start({ cleanup, jsonStorage }) {
		running = true
		setStorage(jsonStorage)
		sendConfig()
		cleanup(jsonStorage.subscribe(() => sendConfig()))
		cleanup(
			getStore<VoiceChannelStore>('SelectedVoiceChannelStore', store => {
				voiceStore = store
			}),
		)
		startVideos(cleanup, inCall)
		const nativePlayer = startAudio(cleanup)
		void listen(nativePlayer)
		cleanup(() => {
			running = false
			setStorage(undefined)
		})
	},
	SettingsComponent: Settings,
})
