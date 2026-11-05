import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { dispatchActivity } from './activity'
import { apply, restartRefresh, scheduleApply } from './apply'
import { PROFILE_KEYS, TIME_MODES, TYPES } from './constants'
import Field from './Field'
import Preview, { describe } from './Preview'
import { currentProfile, merge, newProfile } from './profiles'
import { read, setStorage, toast } from './state'
import { text } from './variables'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps, ReactNode } from 'react'
import type {
	Choice,
	Profile,
	RichPresenceSettings,
	TimestampMode,
} from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: RichPresenceSettings }>
>

/** The variables that can be used in any text field, listed on the settings screen. */
const VARIABLES =
	'{time} {time12} {seconds} {date} {day} {month} {year} {user} {username} {uptime} {sc_title} {sc_artist} {sc_url} {sc_art} {sc_button}'

/** A new id for a profile. */
const newId = () => Date.now().toString(36)

/** The fields of the profile the live preview follows while typing. */
type Draft = { id: string | null; values: Partial<Profile> }

/**
 * The settings screen: the live preview at the top, then the general switches, the profile list and its actions, the
 * fields of the chosen profile (each saves a moment after typing stops), notes, the list of variables, and the actions
 * to apply or clear the presence.
 */
export default function Settings({ api }: Props) {
	const store = api.jsonStorage
	setStorage(store)
	const settings = merge(store.use() as Partial<RichPresenceSettings>)
	const profile = currentProfile(settings)
	const [draft, setDraft] = useState<Draft>({ id: null, values: {} })
	const live: Profile = Object.assign(
		{},
		profile,
		draft.id === profile.id ? draft.values : {},
	)

	/** Remembers what is being typed in a field, so the preview follows it. */
	const onDraft = (key: keyof Profile, value: string) =>
		setDraft(prev => {
			const next = Object.assign(
				{},
				prev.id === profile.id ? prev.values : {},
			) as Record<string, unknown>
			next[key] = value
			return { id: profile.id, values: next as Partial<Profile> }
		})

	/** Saves the settings and sends the presence soon. `reset` restarts the timers. */
	const save = (patch: Partial<RichPresenceSettings>, reset?: boolean) =>
		Promise.resolve(
			store.set(Object.assign({}, read(), patch) as RichPresenceSettings, true),
		).then(() => {
			scheduleApply(!!reset)
			restartRefresh()
		})

	/** Changes some fields of the chosen profile. */
	const update = (patch: Partial<Profile>, reset?: boolean) => {
		const latest = read()
		const id = currentProfile(latest).id
		return save(
			{
				profiles: latest.profiles.map(p =>
					p.id === id ? Object.assign({}, p, patch) : p,
				),
			},
			reset,
		)
	}

	const field = (
		key: keyof Profile & string,
		label: string,
		placeholder: string,
		description: string,
		maxLength: number,
	) => (
		<Field
			key={`${profile.id}:${key}`}
			label={label}
			placeholder={placeholder}
			description={description}
			maxLength={maxLength}
			value={profile[key] as string}
			onDraft={value => onDraft(key, value)}
			onCommit={value =>
				update({ [key]: value } as Partial<Profile>, key === 'timestampMode')
			}
		/>
	)
	const row = (label: string, subLabel: string, onPress?: () => void) => (
		<Design.TableRow
			key={label}
			label={label}
			subLabel={subLabel}
			onPress={onPress}
		/>
	)
	const radio = <V extends string | number>(
		title: string,
		value: V,
		items: Choice<V>[],
		onChange: (value: V) => void,
	) => (
		<Design.TableRadioGroup
			key={title}
			title={title}
			value={value}
			onChange={onChange}
		>
			{items.map(item => (
				<Design.TableRadioRow
					key={String(item.v)}
					label={item.l}
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

	/** Adds a profile to the list and switches to it. */
	const addProfile = (added: Profile) =>
		save(
			{ profiles: read().profiles.concat(added), activeProfile: added.id },
			true,
		)

	const items: ReactNode[] = [
		section(
			'General',
			<Design.TableSwitchRow
				key="enabled"
				label="Show presence"
				subLabel="Turn your custom presence on or off"
				value={settings.enabled}
				onValueChange={(enabled: boolean) => save({ enabled }, true)}
			/>,
			<Design.TableSwitchRow
				key="applyOnStart"
				label="Apply on start"
				subLabel="Set the presence when Discord launches"
				value={settings.applyOnStart}
				onValueChange={(applyOnStart: boolean) => save({ applyOnStart })}
			/>,
			!text(profile.name)
				? row(
						'Nothing is shown yet',
						'Enter an Activity name below to turn your presence on.',
					)
				: null,
		),
		<Field
			key="refresh"
			label="Refresh every (seconds)"
			description="Updates {time}, {uptime} and other variables. 0 turns it off, minimum 15."
			placeholder="0"
			maxLength={5}
			value={settings.refreshSeconds}
			onCommit={refreshSeconds => save({ refreshSeconds })}
		/>,
		radio(
			'Profile',
			profile.id,
			settings.profiles.map(p => ({ v: p.id, l: p.label || p.name || p.id })),
			activeProfile => save({ activeProfile }, true),
		),
		section(
			'Manage profiles',
			row('New profile', 'Start from a blank profile', () => {
				const id = newId()
				addProfile(newProfile(id, `Profile ${read().profiles.length + 1}`))
			}),
			row(
				'Use for SoundCloud',
				'New profile that shows the track from the SoundCloud Presence plugin (set its Show it with to My Rich Presence plugin)',
				() => {
					const id = newId()
					addProfile(
						Object.assign(newProfile(id, 'SoundCloud'), {
							name: 'SoundCloud',
							type: 2,
							details: '{sc_title}',
							state: '{sc_artist}',
							largeImage: '{sc_art}',
							largeText: '{sc_title}',
							timestampMode: 'external' as TimestampMode,
							button1Label: '{sc_button}',
							button1Url: '{sc_url}',
							showOnlyWhen: '{sc_title}',
						}),
					)
					toast('SoundCloud profile added')
				},
			),
			row('Duplicate profile', 'Copy the selected profile', () => {
				const source = currentProfile(read())
				addProfile(
					Object.assign({}, source, {
						id: newId(),
						label: `${source.label || 'Profile'} copy`,
					}),
				)
			}),
			row('Delete profile', 'Remove the selected profile', () => {
				const latest = read()
				if (latest.profiles.length < 2)
					return toast('Keep at least one profile')
				const id = currentProfile(latest).id
				const rest = latest.profiles.filter(p => p.id !== id)
				save({ profiles: rest, activeProfile: rest[0].id }, true)
			}),
			row('Copy profile', 'Copy the selected profile as JSON', () => {
				const out: Record<string, unknown> = {}
				for (const k of PROFILE_KEYS) out[k] = profile[k]
				Clipboard.setString(JSON.stringify(out))
				toast('Profile copied')
			}),
			row('Paste profile', 'Add a profile from the clipboard', () => {
				Promise.resolve(Clipboard.getString()).then(raw => {
					try {
						const data = JSON.parse(raw)
						if (!data || typeof data !== 'object' || Array.isArray(data))
							throw new TypeError()
						const imported = newProfile(
							newId(),
							data.label || 'Imported',
						) as unknown as Record<string, unknown>
						for (const k of PROFILE_KEYS) {
							if (k in data && typeof data[k] !== 'object')
								imported[k] = data[k]
						}
						addProfile(imported as unknown as Profile)
						toast('Profile added')
					} catch {
						toast('Clipboard has no copied profile')
					}
				})
			}),
		),
		field('label', 'Profile name', 'Default', 'Only shown in this list.', 40),
		field(
			'applicationId',
			'Application ID',
			'',
			'Create an application at discord.com/developers and paste its ID. Needed for images and asset keys. Leave empty to use none.',
			24,
		),
		field(
			'name',
			'Activity name',
			'e.g. My game',
			'Required. Nothing is shown until you set it. Supports variables.',
			128,
		),
		field(
			'showOnlyWhen',
			'Show only when this has text',
			'{sc_title}',
			'Optional. Hides your presence while this comes out empty. Example: {sc_title} hides it when no SoundCloud track is playing.',
			128,
		),
		radio('Activity type', profile.type, TYPES, type => update({ type })),
		profile.type === 1
			? field(
					'streamUrl',
					'Stream URL',
					'https://twitch.tv/name',
					'A Twitch or YouTube link.',
					300,
				)
			: null,
		field('details', 'Details', '', 'First line. Supports variables.', 128),
		field(
			'detailsUrl',
			'Details link',
			'https://',
			'Optional. Makes the details line clickable.',
			300,
		),
		field('state', 'State', '', 'Second line. Supports variables.', 128),
		field(
			'stateUrl',
			'State link',
			'https://',
			'Optional. Makes the state line clickable.',
			300,
		),
		radio('Timer', profile.timestampMode, TIME_MODES, timestampMode =>
			update({ timestampMode }, true),
		),
		profile.timestampMode === 'countdown'
			? field(
					'countdownMinutes',
					'Countdown minutes',
					'30',
					'The timer counts down to zero.',
					6,
				)
			: null,
		...(profile.timestampMode === 'custom'
			? [
					field(
						'customStart',
						'Start time',
						'2026-01-01 12:00',
						'A date, or a Unix time in seconds or milliseconds.',
						40,
					),
					field(
						'customEnd',
						'End time',
						'',
						'Set both to loop a countdown of the same length forever.',
						40,
					),
				]
			: []),
		field(
			'largeImage',
			'Large image',
			'https://… or asset key',
			'An image link or an asset key from your application. Needs the Application ID for asset keys.',
			300,
		),
		field(
			'largeUrl',
			'Large image link',
			'https://',
			'Optional. Opens when the image is tapped.',
			300,
		),
		field(
			'largeText',
			'Large image text',
			'',
			'Shown when hovering the large image.',
			128,
		),
		field(
			'smallImage',
			'Small image',
			'https://… or asset key',
			'Shown in the corner of the large image. Small images work most reliably.',
			300,
		),
		field('smallUrl', 'Small image link', 'https://', 'Optional.', 300),
		field('smallText', 'Small image text', '', '', 128),
		field(
			'button1Label',
			'Button 1 label',
			'',
			'A button needs a label and a link.',
			32,
		),
		field('button1Url', 'Button 1 link', 'https://', '', 300),
		field('button2Label', 'Button 2 label', '', '', 32),
		field('button2Url', 'Button 2 link', 'https://', '', 300),
		field(
			'partyCurrent',
			'Party size',
			'1',
			'Current players. Set the maximum below as well.',
			4,
		),
		field('partyMax', 'Party maximum', '4', '', 4),
		section(
			'Good to know',
			row(
				'Your own buttons',
				"Discord doesn't show buttons on your own profile. Other people can see them on desktop, not always on mobile.",
			),
			row(
				'Share activity',
				'Your presence only shows if Discord is allowed to share your activity in your privacy settings.',
			),
			row(
				'Fancy text',
				'Unusual unicode text can stop a presence from showing. Try normal letters.',
			),
			row(
				'Image links',
				'Paste any link you could post in chat: a direct image link, an Imgur link, or a page with a picture. The plugin finds the picture Discord would show. If one fails, try a smaller image.',
			),
			row(
				'Photos from your phone',
				'Upload the photo to catbox.moe or imgur.com, copy the link, and paste it into Large image. Discord attachment links stop working after about a day.',
			),
			row(
				'Asset keys',
				'Or upload art in your application on discord.com/developers under Rich Presence, then type its key (the asset name) into Large image and set the Application ID.',
			),
		),
		section(
			'Variables',
			row(
				VARIABLES,
				'Use these in any text field. They update on the refresh interval.',
			),
		),
		section(
			'Actions',
			row(
				'Apply now',
				'Send the selected profile and restart its timer',
				() => {
					apply(true)
					toast('Presence applied')
				},
			),
			row('Clear presence', 'Remove your custom presence', () => {
				dispatchActivity(null)
				toast('Presence cleared')
			}),
		),
	]

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			stickyHeaderIndices={[0]}
			keyboardShouldPersistTaps="handled"
		>
			<Preview info={describe(live)} />
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				{items}
			</Design.Stack>
		</ScrollView>
	)
}
