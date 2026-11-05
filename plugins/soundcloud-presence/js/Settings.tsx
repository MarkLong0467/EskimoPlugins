import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { apply, checkClipboard, showTrack, stopShowing } from './apply'
import { OUTPUTS, POLLS, STATUS_TEXTS, TIMER_MODES } from './constants'
import Field from './Field'
import { parseLink } from './format'
import { fetchNowPlaying, restartPolling } from './lastfm'
import Preview from './Preview'
import { effective } from './present'
import { merge, read, save, setStorage, state, toast } from './state'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps, ReactNode } from 'react'
import type { Choice, SoundCloudSettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: SoundCloudSettings }>
>

/**
 * The settings screen: the live preview, then the automatic mode (Last.fm name and key, a test, how often to check), a
 * track by link (typed, from the clipboard or from the recent list), the general switches, where to show the status,
 * how it looks, the timer, and the actions to restart the timer or stop showing.
 */
export default function Settings({ api }: Props) {
	const store = api.jsonStorage
	setStorage(store)
	const settings = merge(store.use() as Partial<SoundCloudSettings>)
	const [link, setLink] = useState('')

	/** Saves one setting, then re-reads Last.fm settings and updates the status. */
	const set = <K extends keyof SoundCloudSettings>(
		key: K,
		value: SoundCloudSettings[K],
	) =>
		save({ [key]: value } as Partial<SoundCloudSettings>).then(() => {
			restartPolling()
			return apply()
		})

	const row = (label: string, subLabel: string, onPress?: () => void) => (
		<Design.TableRow
			key={label}
			label={label}
			subLabel={subLabel}
			onPress={onPress}
		/>
	)
	const toggle = (
		label: string,
		subLabel: string,
		key: keyof SoundCloudSettings,
	) => (
		<Design.TableSwitchRow
			key={label}
			label={label}
			subLabel={subLabel}
			value={!!settings[key]}
			onValueChange={(value: boolean) => set(key, value as never)}
		/>
	)
	const radio = <V extends string | number>(
		title: string,
		key: keyof SoundCloudSettings,
		items: Choice<V>[],
	) => (
		<Design.TableRadioGroup
			key={title}
			title={title}
			value={settings[key] as V}
			onChange={(value: V) => set(key, value as never)}
		>
			{items.map(item => (
				<Design.TableRadioRow
					key={String(item.v)}
					label={item.l}
					subLabel={item.s}
					value={item.v}
				/>
			))}
		</Design.TableRadioGroup>
	)
	const section = (title: string, ...kids: ReactNode[]) => (
		<Design.TableRowGroup key={title} title={title}>
			{kids.filter(Boolean)}
		</Design.TableRowGroup>
	)

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

	const items: ReactNode[] = [
		section(
			'Automatic (Last.fm)',
			toggle(
				'Detect what I am playing',
				'Follows your Last.fm now playing, so the status changes by itself with each song',
				'autoEnabled',
			),
			row(
				'How to set it up',
				'1. Install Pano Scrobbler and let it scrobble the SoundCloud app. 2. Make a free key at last.fm/api/account/create. 3. Enter your Last.fm name and the key below.',
			),
		),
		<Field
			key="lfmUser"
			label="Last.fm username"
			placeholder="your-name"
			maxLength={40}
			value={settings.lfmUser}
			onCommit={value => set('lfmUser', value)}
		/>,
		<Field
			key="lfmKey"
			label="Last.fm API key"
			description="The API key, not the shared secret. It only reads your public scrobbles."
			placeholder="32 letters and numbers"
			maxLength={64}
			value={settings.lfmKey}
			onCommit={value => set('lfmKey', value)}
		/>,
		section(
			'Check',
			row(
				'Test Last.fm',
				'Check the name and key, and what is playing now',
				testLastfm,
			),
		),
		settings.autoEnabled
			? radio('Check how often', 'pollSeconds', POLLS)
			: null,
		section(
			'Or show a track by link',
			<Design.TextInput
				key="link"
				label="SoundCloud link"
				description="A track or playlist link. The text SoundCloud copies when you share also works. Automatic mode wins while a song is playing."
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
		settings.recents.length
			? section(
					'Recent',
					settings.recents.map((r, i) => (
						<Design.TableRow
							key={`${r.url}${i}`}
							label={r.title}
							subLabel={r.artist || 'SoundCloud'}
							onPress={() => showTrack(r.url)}
						/>
					)),
					row('Clear recent tracks', 'Forget the list above', () => {
						save({ recents: [] })
					}),
				)
			: null,
		section(
			'General',
			toggle(
				'Show status',
				'Put the current track on your Discord profile',
				'enabled',
			),
			toggle(
				'Show again when Discord opens',
				'Brings the last track back if it has not finished',
				'applyOnStart',
			),
			toggle(
				'Clear when the track ends',
				'Removes your status after the last second (progress bar only)',
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
		radio('Show it with', 'output', OUTPUTS),
		section(
			'Appearance',
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
		settings.showButton ? (
			<Field
				key="buttonLabel"
				label="Button text"
				description="Up to 32 characters. Used for tracks with a link."
				placeholder="Listen on SoundCloud"
				maxLength={32}
				value={settings.buttonLabel}
				onCommit={value => set('buttonLabel', value)}
			/>
		) : null,
		<Field
			key="smallIcon"
			label="Small icon link"
			description="Optional. A link to a small SoundCloud logo, or any image. It shows in the corner of the cover."
			placeholder="https://"
			maxLength={300}
			value={settings.smallIcon}
			onCommit={value => set('smallIcon', value)}
		/>,
		radio('Timer', 'timerMode', TIMER_MODES),
		radio('Status text', 'statusText', STATUS_TEXTS),
		section(
			'Actions',
			row('Restart the timer', 'Start counting from now', () => {
				const t = effective(read())
				if (!t) return toast('Show a track first')
				if (state.auto && read().autoEnabled) state.auto.startedAt = Date.now()
				else save({ current: Object.assign({}, t, { startedAt: Date.now() }) })
				apply()
			}),
			row('Stop showing', 'Remove SoundCloud from your profile', () => {
				stopShowing()
				toast('Status cleared')
			}),
		),
		section(
			'How it works',
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
				'Last.fm does not always notice a pause. With a known length the status ends on its own when the song does.',
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
			<Preview settings={settings} />
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				{items}
			</Design.Stack>
		</ScrollView>
	)
}
