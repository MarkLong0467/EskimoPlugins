import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import {
	addProfile,
	copyOf,
	deleteProfile,
	profileToJson,
	updateProfile,
} from './actions'
import { applySome, standingOf } from './apply'
import {
	REPEATS,
	STANDING_TEXT,
	TIME_MODES,
	TYPES,
	WEEKDAYS_SHORT,
} from './constants'
import Field from './Field'
import Preview, { describe } from './Preview'
import { toast } from './state'
import {
	clockText,
	dateText,
	parseClock,
	parseDate,
	relativeText,
} from './timers'
import { Back, radio, row, section, Tabs, toggleRow } from './ui'
import { warnings } from './warnings'
import type { Choice, Profile, RichPresenceSettings } from './types'

type TabId = 'basics' | 'text' | 'images' | 'timer' | 'buttons' | 'when'

/** The pages of the editor. */
const TABS: Choice<TabId>[] = [
	{ v: 'basics', l: 'Basics' },
	{ v: 'text', l: 'Text' },
	{ v: 'images', l: 'Images' },
	{ v: 'timer', l: 'Timer' },
	{ v: 'buttons', l: 'Buttons' },
	{ v: 'when', l: 'When' },
]

/** What a date field says it understood, so a mistake is clear before anything is sent. */
export function readsDate(value: unknown): string {
	if (!String(value || '').trim())
		return 'Type a date and time, such as 2026-12-25 18:30.'
	const date = parseDate(value)
	return date === undefined
		? 'Not a date yet. Try 2026-12-25 18:30.'
		: `Reads as ${dateText(date)} (${relativeText(date)}).`
}

/** What a time of day field says it understood. */
export function readsClock(value: unknown): string {
	if (!String(value || '').trim()) return 'Type a time, such as 9:00 or 9pm.'
	const minutes = parseClock(value)
	return minutes === undefined
		? 'Not a time yet. Try 9:00 or 9pm.'
		: `Reads as ${clockText(minutes)}.`
}

/**
 * The editor of one custom presence. The top shows how it will look; below are six pages picked with the buttons: Basics
 * (name, kind, application), Text, Images, Timer, Buttons and When (schedule and "show only when"). Every text box saves a
 * moment after typing stops.
 *
 * @param profile The presence being edited.
 * @param settings The settings, for the reasons it is or is not shown.
 * @param onBack Goes back to the list.
 */
export default function EditProfile({
	profile,
	settings,
	onBack,
}: {
	profile: Profile
	settings: RichPresenceSettings
	onBack: () => void
}) {
	const [tab, setTab] = useState<TabId>('basics')
	const [draft, setDraft] = useState<{ id: string; values: Partial<Profile> }>({
		id: '',
		values: {},
	})
	const live: Profile = Object.assign(
		{},
		profile,
		draft.id === profile.id ? draft.values : {},
	)

	/** Remembers what is being typed in a field, so the preview and the notes follow it. */
	const onDraft = (key: keyof Profile, value: string) =>
		setDraft(prev => {
			const next = Object.assign(
				{},
				prev.id === profile.id ? prev.values : {},
			) as Record<string, unknown>
			next[key] = value
			return { id: profile.id, values: next as Partial<Profile> }
		})

	const update = (patch: Partial<Profile>, reset?: boolean) =>
		updateProfile(profile.id, patch, reset)

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
				update(
					{ [key]: value } as Partial<Profile>,
					key.startsWith('timer') ||
						key.startsWith('custom') ||
						key.startsWith('countdown') ||
						key.startsWith('daily'),
				)
			}
		/>
	)

	const mine = warnings(settings).filter(w => w.id === profile.id)

	/** The page for the chosen button. */
	let page: React.ReactNode[]
	if (tab === 'basics') {
		page = [
			section(
				'This presence',
				STANDING_TEXT[standingOf(settings, profile)],
				field(
					'label',
					'Name in the list',
					'My game',
					'Only you see this, in the list of presences.',
					40,
				),
				field(
					'name',
					'Activity name',
					'e.g. My game',
					'Required. It is the big title of the card. Nothing shows until you set it. Supports variables.',
					128,
				),
			),
			radio(
				'Kind of activity',
				profile.type,
				TYPES,
				type => update({ type }),
				'Discord shows only one Playing at a time. Make the others Listening to, Watching or Competing in so they can show together.',
			),
			profile.type === 1
				? field(
						'streamUrl',
						'Stream link',
						'https://twitch.tv/name',
						'A Twitch or YouTube link.',
						300,
					)
				: null,
			section(
				'Application ID',
				'Needed to show more than one presence at once. Each presence needs a different one. Leave it empty and one is made up for you. Typing the same ID into two presences makes Discord show them as one.',
				field(
					'applicationId',
					'Application ID',
					'Leave empty for a made-up one',
					'Only needed for image asset keys: create an application at discord.com/developers and paste its ID.',
					24,
				),
			),
			section(
				'Manage',
				undefined,
				row('Show this now', 'Send it again and restart its timer', () => {
					applySome([profile.id], true)
					toast('Presence applied')
				}),
				row('Duplicate', 'Make a copy of this presence', () => {
					addProfile(copyOf(profile))
					toast('Copy added')
				}),
				row(
					'Copy as text',
					'Copy it so it can be pasted on another phone',
					() => {
						Clipboard.setString(profileToJson(profile))
						toast('Presence copied')
					},
				),
				row('Delete', 'Remove this presence for good', () => {
					deleteProfile(profile.id).then(ok => {
						if (ok) onBack()
						else toast('Keep at least one presence')
					})
				}),
			),
		]
	} else if (tab === 'text') {
		page = [
			section(
				'Lines',
				'The two lines under the title. Supports variables.',
				field(
					'details',
					'Top line',
					'',
					'The first line, under the title.',
					128,
				),
				field('state', 'Bottom line', '', 'The second line.', 128),
			),
			section(
				'Make a line a link',
				'Optional. Makes the line tappable.',
				field('detailsUrl', 'Top line link', 'https://', '', 300),
				field('stateUrl', 'Bottom line link', 'https://', '', 300),
			),
			section(
				'Group size',
				'Shows "(1 of 4)" after the bottom line. Fill in both.',
				field('partyCurrent', 'In the group now', '1', '', 4),
				field('partyMax', 'Group size', '4', '', 4),
			),
			section(
				'Variables',
				'Use these in any text box. They update on the refresh interval.',
				row(
					'{time} {time12} {seconds} {date} {day} {month} {year} {user} {username} {uptime}',
					'SoundCloud: {sc_title} {sc_artist} {sc_url} {sc_art} {sc_button}',
				),
			),
		]
	} else if (tab === 'images') {
		page = [
			section(
				'Large image',
				'The square picture. Paste any link you could post in chat, or an asset key from your application.',
				field(
					'largeImage',
					'Image',
					'https://… or asset key',
					'Imgur links and pages with a picture work too. If one fails, try a smaller image.',
					300,
				),
				field('largeText', 'Text when pressed', '', '', 128),
				field('largeUrl', 'Link when tapped', 'https://', 'Optional.', 300),
			),
			section(
				'Small image',
				'A small picture in the corner of the large one.',
				field('smallImage', 'Image', 'https://… or asset key', '', 300),
				field('smallText', 'Text when pressed', '', '', 128),
				field('smallUrl', 'Link when tapped', 'https://', 'Optional.', 300),
			),
			section(
				'Good to know',
				undefined,
				row(
					'Photos from your phone',
					'Upload the photo to catbox.moe or imgur.com, copy the link and paste it in Image. Discord attachment links stop working after about a day.',
				),
				row(
					'Asset keys',
					'Upload art in your application on discord.com/developers under Rich Presence, type its name in Image and set the Application ID.',
				),
			),
		]
	} else if (tab === 'timer') {
		const mode = profile.timestampMode
		page = [
			radio(
				'What the timer does',
				mode,
				TIME_MODES,
				timestampMode => update({ timestampMode }, true),
				'The timer shows under the lines on the card.',
			),
			mode === 'since' || mode === 'until'
				? section(
						mode === 'since' ? 'Count up from' : 'Count down to',
						mode === 'since'
							? 'A date in the past. The card counts how long it has been.'
							: 'A date in the future. The card counts down to it.',
						field(
							'timerDate',
							'Date and time',
							'2026-12-25 18:30',
							readsDate(live.timerDate),
							40,
						),
					)
				: null,
			mode === 'until'
				? radio(
						'When the date has passed',
						profile.timerRepeat,
						REPEATS,
						timerRepeat => update({ timerRepeat }, true),
					)
				: null,
			mode === 'countdown'
				? section(
						'Countdown',
						undefined,
						field(
							'countdownMinutes',
							'Minutes',
							'30',
							'How long it counts down from when the presence is switched on.',
							6,
						),
						toggleRow(
							'Start over when it ends',
							'Counts down the same time again and again',
							!!profile.countdownLoop,
							countdownLoop => update({ countdownLoop }, true),
						),
					)
				: null,
			mode === 'daily'
				? section(
						'Every day',
						'A progress bar from the first time to the second. It shows while it is in that range. A second time earlier than the first runs past midnight.',
						field('dailyFrom', 'From', '9:00', readsClock(live.dailyFrom), 8),
						field('dailyTo', 'To', '17:00', readsClock(live.dailyTo), 8),
					)
				: null,
			mode === 'custom'
				? section(
						'Your own timer',
						'A start counts up, an end counts down. Set both and the same length starts over again and again.',
						field(
							'customStart',
							'Start',
							'2026-01-01 12:00',
							readsDate(live.customStart),
							40,
						),
						field('customEnd', 'End', '', readsDate(live.customEnd), 40),
					)
				: null,
		]
	} else if (tab === 'buttons') {
		page = [
			section(
				'Button 1',
				'A button needs a label and a link. Other people see it; Discord does not show it on your own profile.',
				field('button1Label', 'Label', 'Listen along', '', 32),
				field('button1Url', 'Link', 'https://', '', 300),
			),
			section(
				'Button 2',
				undefined,
				field('button2Label', 'Label', '', '', 32),
				field('button2Url', 'Link', 'https://', '', 300),
			),
		]
	} else {
		const days =
			Array.isArray(profile.scheduleDays) && profile.scheduleDays.length === 7
				? profile.scheduleDays
				: [true, true, true, true, true, true, true]
		page = [
			section(
				'Schedule',
				'Show this presence only on some days and between some times. Outside them it is taken off your profile by itself.',
				toggleRow(
					'Use a schedule',
					'Off means it shows whenever it is switched on',
					!!profile.scheduleOn,
					scheduleOn => update({ scheduleOn }),
				),
			),
			profile.scheduleOn
				? section(
						'Days',
						'Tap a day to turn it on or off.',
						<View
							key="days"
							style={{
								flexDirection: 'row',
								flexWrap: 'wrap',
								gap: 8,
								paddingVertical: 8,
							}}
						>
							{WEEKDAYS_SHORT.map((name, i) => (
								<Design.Button
									key={name}
									text={name}
									variant={days[i] ? 'primary' : 'secondary'}
									size="sm"
									onPress={() =>
										update({
											scheduleDays: days.map((d, j) => (j === i ? !d : d)),
										})
									}
								/>
							))}
						</View>,
						field(
							'scheduleFrom',
							'From',
							'9:00',
							readsClock(live.scheduleFrom),
							8,
						),
						field(
							'scheduleTo',
							'To',
							'17:00',
							`${readsClock(live.scheduleTo)} A time earlier than From runs past midnight.`,
							8,
						),
					)
				: null,
			section(
				'Show only when',
				'Optional. Hides this presence while the text comes out empty. Example: {sc_title} hides it when no SoundCloud track is playing.',
				field(
					'showOnlyWhen',
					'This text has to have something in it',
					'{sc_title}',
					'',
					128,
				),
			),
		]
	}

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			stickyHeaderIndices={[0]}
			keyboardShouldPersistTaps="handled"
		>
			<Preview info={describe(live)} profileId={profile.id} />
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				<Back title="All presences" onPress={onBack} />
				<Tabs tabs={TABS} value={tab} onChange={setTab} />
				{mine.length
					? section(
							'Fix this',
							undefined,
							...mine.map((w, i) => row(`⚠ Problem ${i + 1}`, w.text)),
						)
					: null}
				{page}
			</Design.Stack>
		</ScrollView>
	)
}
