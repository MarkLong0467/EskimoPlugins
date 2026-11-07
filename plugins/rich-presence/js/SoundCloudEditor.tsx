import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { setSoundCloud, toggleProfile } from './actions'
import { standingOf } from './apply'
import {
	SC_POLLS,
	SC_STATUS_TEXTS,
	SC_TIMER_MODES,
	STANDING_TEXT,
} from './constants'
import Field from './Field'
import { parseLink } from './format'
import { fetchNowPlaying } from './lastfm'
import { SoundCloudPreview } from './Preview'
import { effective } from './present'
import { sc } from './scstate'
import {
	checkClipboard,
	refreshSoundCloud,
	showTrack,
	stopShowing,
} from './soundcloud'
import { read, saveSoundCloud, toast } from './state'
import { Back, radio, row, section, toggleRow } from './ui'
import { warnings } from './warnings'
import type { Profile, RichPresenceSettings, SoundCloudSettings } from './types'

/**
 * The editor of the SoundCloud presence. It shows only the SoundCloud settings, none of the custom ones: the switch for
 * the profile, the automatic mode (Last.fm name and key, a test, how often to check), a track by link (typed, from the
 * clipboard or from the recent list), how it behaves, how it looks, the timer and the status text.
 *
 * @param profile The SoundCloud profile.
 * @param settings The settings.
 * @param onBack Goes back to the list.
 */
export default function SoundCloudEditor({
	profile,
	settings,
	onBack,
}: {
	profile: Profile
	settings: RichPresenceSettings
	onBack: () => void
}) {
	const s = settings.soundcloud
	const [link, setLink] = useState('')

	const set = <K extends keyof SoundCloudSettings>(
		key: K,
		value: SoundCloudSettings[K],
	) => setSoundCloud({ [key]: value } as Partial<SoundCloudSettings>)

	const toggle = (
		label: string,
		subLabel: string,
		key: keyof SoundCloudSettings,
	) => toggleRow(label, subLabel, !!s[key], value => set(key, value as never))

	const choose = <V extends string | number>(
		title: string,
		key: keyof SoundCloudSettings,
		items: Parameters<typeof radio<V>>[2],
	) => radio(title, s[key] as V, items, value => set(key, value as never))

	/** Looks up the typed link, and clears the box if it worked. */
	const submit = () => {
		const found = parseLink(link)
		if (!found) return toast('That does not look like a SoundCloud link')
		showTrack(found).then(ok => {
			if (ok) setLink('')
		})
	}

	/** Asks Last.fm what is playing, to check the name and key. */
	const testLastfm = () => {
		fetchNowPlaying().then(
			np =>
				toast(
					np
						? `Connected. Now playing: ${np.title}${np.artist ? ` by ${np.artist}` : ''}`
						: 'Connected. Nothing is playing right now.',
				),
			e => toast(String(e?.message || e)),
		)
	}

	const mine = warnings(settings).filter(w => w.id === profile.id)
	const items = [
		mine.length
			? section(
					'Fix this',
					undefined,
					...mine.map((w, i) => row(`⚠ Problem ${i + 1}`, w.text)),
				)
			: null,
		section(
			'SoundCloud',
			STANDING_TEXT[standingOf(settings, profile)],
			toggleRow(
				'Show SoundCloud on my profile',
				'Put the track you are listening to on your Discord profile',
				!!profile.enabled,
				on => toggleProfile(profile.id, on),
			),
		),
		section(
			'Automatic (Last.fm)',
			'Follows your Last.fm now playing, so the card changes by itself with each song.',
			toggle(
				'Detect what I am playing',
				'Needs Pano Scrobbler and a free Last.fm key',
				'autoEnabled',
			),
			row(
				'How to set it up',
				'1. Install Pano Scrobbler and let it scrobble the SoundCloud app. 2. Make a free key at last.fm/api/account/create. 3. Enter your Last.fm name and the key below.',
			),
			<Field
				key="lfmUser"
				label="Last.fm username"
				placeholder="your-name"
				maxLength={40}
				value={s.lfmUser}
				onCommit={value => set('lfmUser', value)}
			/>,
			<Field
				key="lfmKey"
				label="Last.fm API key"
				description="The API key, not the shared secret. It only reads your public scrobbles."
				placeholder="32 letters and numbers"
				maxLength={64}
				value={s.lfmKey}
				onCommit={value => set('lfmKey', value)}
			/>,
			row(
				'Test Last.fm',
				'Check the name and key, and what is playing now',
				testLastfm,
			),
		),
		s.autoEnabled
			? choose<string>('Check how often', 'pollSeconds', SC_POLLS)
			: null,
		section(
			'Or show a track by link',
			'Automatic mode wins while a song is playing.',
			<Design.TextInput
				key="link"
				label="SoundCloud link"
				description="A track or playlist link. The text SoundCloud copies when you share also works."
				placeholder="https://soundcloud.com/artist/track"
				size="md"
				value={link}
				onChange={setLink}
			/>,
			row('Show this track', 'Look it up and put it on your profile', submit),
			row('Paste from clipboard', 'Use the SoundCloud link you copied', () => {
				checkClipboard(false)
			}),
		),
		s.recents.length
			? section(
					'Recent',
					undefined,
					s.recents.map((r, i) => (
						<Design.TableRow
							key={`${r.url}${i}`}
							label={r.title}
							subLabel={r.artist || 'SoundCloud'}
							onPress={() => showTrack(r.url)}
						/>
					)),
					row('Clear recent tracks', 'Forget the list above', () => {
						saveSoundCloud({ recents: [] })
					}),
				)
			: null,
		section(
			'Behaviour',
			undefined,
			toggle(
				'Clear when the track ends',
				'Removes the card after the last second (progress bar only)',
				'clearAtEnd',
			),
			toggle(
				'Hide while Spotify is playing',
				'Steps aside so you do not show two "Listening to" cards at once',
				'hideWithSpotify',
			),
			toggle(
				'Check the clipboard when Discord opens',
				'In SoundCloud tap Share, then Copy link. Opening Discord shows it. Android may notify you that Discord read the clipboard.',
				'clipboardOnOpen',
			),
		),
		section(
			'Look',
			undefined,
			toggle(
				'Artwork',
				'Show the track cover as the large image',
				'showArtwork',
			),
			toggle(
				'Find missing covers',
				"When Last.fm has no cover, look the song up in Apple Music's public search. Only an exact title and artist match is used. This sends the artist and title to Apple.",
				'coverLookup',
			),
			toggle(
				'Use a SoundCloud cover when none is found',
				'Shows an orange SoundCloud cover instead of an empty box',
				'fallbackCover',
			),
			toggle('Artist', 'Show the artist under the title', 'showArtist'),
			toggle(
				'Listen button',
				'A button on your profile. Automatic tracks open a SoundCloud search for the song.',
				'showButton',
			),
		),
		s.showButton ? (
			<Field
				key="buttonLabel"
				label="Button text"
				description="Up to 32 characters. Used for tracks with a link."
				placeholder="Listen on SoundCloud"
				maxLength={32}
				value={s.buttonLabel}
				onCommit={value => set('buttonLabel', value)}
			/>
		) : null,
		<Field
			key="smallIcon"
			label="Small icon link"
			description="Optional. A link to a small SoundCloud logo, or any image. It shows in the corner of the cover."
			placeholder="https://"
			maxLength={300}
			value={s.smallIcon}
			onCommit={value => set('smallIcon', value)}
		/>,
		choose<string>('Timer', 'timerMode', SC_TIMER_MODES),
		choose<number>('Text after "Listening to"', 'statusText', SC_STATUS_TEXTS),
		section(
			'Actions',
			undefined,
			row('Restart the timer', 'Start counting from now', () => {
				const t = effective(read().soundcloud)
				if (!t) return toast('Show a track first')
				if (sc.auto && read().soundcloud.autoEnabled) {
					sc.auto.startedAt = Date.now()
					refreshSoundCloud()
				} else {
					saveSoundCloud({
						current: Object.assign({}, t, { startedAt: Date.now() }),
					}).then(() => refreshSoundCloud())
				}
			}),
			row('Stop showing', 'Remove SoundCloud from your profile', () => {
				stopShowing()
				toast('Presence cleared')
			}),
		),
		section(
			'How it works',
			undefined,
			row(
				'Why Last.fm?',
				'Discord cannot see what other apps are playing. A scrobbler app can, because it reads the media notification. It reports to Last.fm, and this plugin reads Last.fm.',
			),
			row(
				'What shows',
				'Title, artist and cover come from Last.fm. The button opens a SoundCloud search, because Last.fm does not know the SoundCloud link. Paste a link to get the exact one.',
			),
			row(
				'Pausing',
				'Last.fm does not always notice a pause. With a known length the card ends on its own when the song does.',
			),
			row(
				'Other presences',
				'Your other presences can show the track too: use {sc_title}, {sc_artist}, {sc_art} and {sc_url} in their text, or pick "From the SoundCloud track" as their timer.',
			),
		),
	]

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			stickyHeaderIndices={[0]}
			keyboardShouldPersistTaps="handled"
		>
			<SoundCloudPreview settings={s} on={!!profile.enabled} />
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				<Back title="All presences" onPress={onBack} />
				{items}
			</Design.Stack>
		</ScrollView>
	)
}
