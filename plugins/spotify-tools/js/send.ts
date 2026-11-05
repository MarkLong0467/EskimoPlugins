import { currentTrack, mySpotifyActivity } from './activity'
import { findByProps, store, toast } from './discord'
import type {
	ChannelStore,
	DraftActions,
	DraftStore,
	MessageSender,
	SelectedChannelStore,
} from './types'

/**
 * Sends a message to the chat you last had open.
 *
 * @param message Makes the message from the channel id.
 * @param clearDraft Whether Discord should clear the draft box after sending.
 * @param options Extra options for Discord's `sendMessage`, such as `activityAction`.
 * @returns The channel it was sent to, or false (with a toast) if no chat is open.
 */
function sendMessage(
	message: (channelId: string) => object,
	clearDraft: boolean,
	options?: object,
): string | false {
	const messages = findByProps<MessageSender>('sendMessage', 'revealMessage')
	const channel = store<SelectedChannelStore>(
		'SelectedChannelStore',
	)?.getChannelId()
	if (!messages || !channel) {
		toast('Open a chat first, then try again.')
		return false
	}
	messages.sendMessage(
		channel,
		Object.assign(
			{ tts: false, invalidEmojis: [], validNonShortcutEmojis: [] },
			message(channel),
		),
		clearDraft,
		options || {},
	)
	return channel
}

/** Sends the invite card for the song you are playing. What you typed in the box is its message. */
export function sendInvite(): void {
	const activity = mySpotifyActivity()
	if (!activity?.party?.id) {
		toast('Play something on Spotify first.')
		return
	}

	const draft = store<DraftStore>('DraftStore')
	const channel = sendMessage(
		id => ({ content: draft?.getDraft(id, 0) || '' }),
		true,
		{ activityAction: { activity, type: 3 } },
	)
	if (!channel) return

	findByProps<DraftActions>('clearDraft')?.clearDraft(channel, 0)
	const info = store<ChannelStore>('ChannelStore')?.getChannel(channel)
	toast(`Invite sent${info?.name ? ` to #${info.name}` : ''}`)
}

/** Sends a link to the song you are playing. */
export function sendSongLink(): void {
	const track = currentTrack()
	if (!track.trackId) {
		toast('Play something on Spotify first.')
		return
	}
	if (
		sendMessage(
			() => ({ content: `https://open.spotify.com/track/${track.trackId}` }),
			false,
		)
	)
		toast('Song link sent')
}

/** Sends a link to the album of the song you are playing. */
export function sendAlbumLink(): void {
	const track = currentTrack()
	if (!track.trackId) {
		toast('Play something on Spotify first.')
		return
	}
	if (!track.albumId) {
		toast('Could not find the album for this song.')
		return
	}
	if (
		sendMessage(
			() => ({ content: `https://open.spotify.com/album/${track.albumId}` }),
			false,
		)
	)
		toast('Album link sent')
}
