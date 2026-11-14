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
	showsTimer,
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
import { Back, block, group, radio, row, section, toggleRow } from './ui'
import { PARTY_MAX_SIZE, partyProblem } from './variables'
import { warnings } from './warnings'
import type { Profile, RichPresenceSettings } from './types'

/** The longest a group size can be typed: the digits of the biggest size Discord takes. */
const PARTY_DIGITS = String(PARTY_MAX_SIZE).length

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
 * The editor of one custom presence, on one page you scroll down, like Kizzy's. The top shows how it will look. Below it each
 * part has a big title and one short line: Basics, Text, Group size, Images, Timer, Buttons, Schedule, Application ID,
 * Variables and Manage. Parts that only matter for a choice (the dates of a timer, the days of a schedule) appear when that
 * choice is made. Every text box saves a moment after typing stops.
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
	const mode = profile.timestampMode
	const days =
		Array.isArray(profile.scheduleDays) && profile.scheduleDays.length === 7
			? profile.scheduleDays
			: [true, true, true, true, true, true, true]

	/** The group size notes follow what is typed, like Kizzy's red lines under its boxes. */
	const partyNow = partyProblem('current', live.partyCurrent, live.partyMax)
	const partyMaxNote = partyProblem('max', live.partyCurrent, live.partyMax)

	const parts = [
		mine.length
			? section(
					'Fix this',
					undefined,
					...mine.map((w, i) => row(`⚠ Problem ${i + 1}`, w.text)),
				)
			: null,

		block(
			'Basics',
			STANDING_TEXT[standingOf(settings, profile)],
			group(
				'basics',
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
					'Required. The big title of the card. Nothing shows until you set it. Supports variables.',
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
				? group(
						'stream',
						field(
							'streamUrl',
							'Stream link',
							'https://twitch.tv/name',
							'A Twitch or YouTube link.',
							300,
						),
					)
				: null,
		),

		block(
			'Text',
			'The two lines under the title. They support variables.',
			group(
				'lines',
				field(
					'details',
					'Top line',
					'',
					'The first line, under the title.',
					128,
				),
				field('state', 'Bottom line', '', 'The second line.', 128),
			),
			group(
				'line-links',
				field(
					'detailsUrl',
					'Top line link',
					'https://',
					'Optional. Makes the top line tappable.',
					300,
				),
				field(
					'stateUrl',
					'Bottom line link',
					'https://',
					'Optional. Makes the bottom line tappable.',
					300,
				),
			),
		),

		block(
			'Group size',
			`Shows "1 of 4" on the card. Fill in both. Any whole number up to ${PARTY_MAX_SIZE}.`,
			group(
				'party',
				field(
					'partyCurrent',
					'In the group now',
					'1',
					partyNow ?? 'How many are in the group.',
					PARTY_DIGITS,
				),
				field(
					'partyMax',
					'Group size',
					'4',
					partyMaxNote ?? 'How many fit in the group.',
					PARTY_DIGITS,
				),
			),
		),

		block(
			'Images',
			'Paste any link you could post in chat, or an asset key from your application.',
			group(
				'large',
				field(
					'largeImage',
					'Large image',
					'https://… or asset key',
					'The square picture. Imgur links and pages with a picture work too. If one fails, try a smaller image.',
					300,
				),
				field(
					'largeText',
					'Large image text',
					'',
					'Shown when the picture is pressed.',
					128,
				),
				field(
					'largeUrl',
					'Large image link',
					'https://',
					'Optional. Opened when the picture is tapped.',
					300,
				),
			),
			group(
				'small',
				field(
					'smallImage',
					'Small image',
					'https://… or asset key',
					'A small picture in the corner of the large one.',
					300,
				),
				field(
					'smallText',
					'Small image text',
					'',
					'Shown when the picture is pressed.',
					128,
				),
				field(
					'smallUrl',
					'Small image link',
					'https://',
					'Optional. Opened when the picture is tapped.',
					300,
				),
			),
			group(
				'image-tips',
				row(
					'Photos from your phone',
					'Upload the photo to catbox.moe or imgur.com, copy the link and paste it in Large image. Discord attachment links stop working after about a day.',
				),
				row(
					'Asset keys',
					'Upload art in your application on discord.com/developers under Rich Presence, type its name in the image box and set the Application ID.',
				),
			),
		),

		block(
			'Timer',
			showsTimer(live.type)
				? 'The timer shows under the lines on the card.'
				: `Discord shows no timer on a ${Number(live.type) === 1 ? 'Streaming' : 'Competing in'} card. Change the type to Playing, Listening to or Watching (Basics) for the timer to show.`,
			radio('What the timer does', mode, TIME_MODES, timestampMode =>
				update({ timestampMode }, true),
			),
			mode === 'since' || mode === 'until'
				? group(
						'timer-date',
						field(
							'timerDate',
							mode === 'since' ? 'Count up from' : 'Count down to',
							'2026-12-25 18:30',
							`${
								mode === 'since'
									? 'A date in the past.'
									: 'A date in the future.'
							} ${readsDate(live.timerDate)}`,
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
				? group(
						'countdown',
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
				? group(
						'daily',
						field(
							'dailyFrom',
							'Every day from',
							'9:00',
							`A progress bar that shows while it is in range. ${readsClock(live.dailyFrom)}`,
							8,
						),
						field(
							'dailyTo',
							'Every day to',
							'17:00',
							`${readsClock(live.dailyTo)} A time earlier than the first runs past midnight.`,
							8,
						),
					)
				: null,
			mode === 'custom'
				? group(
						'custom',
						field(
							'customStart',
							'Start',
							'2026-01-01 12:00',
							`A start counts up. ${readsDate(live.customStart)}`,
							40,
						),
						field(
							'customEnd',
							'End',
							'',
							`An end counts down. Set both and the same length starts over again and again. ${readsDate(live.customEnd)}`,
							40,
						),
					)
				: null,
		),

		block(
			'Buttons',
			'A button needs a label and a link. Other people see them; Discord does not show them on your own profile.',
			group(
				'button1',
				field('button1Label', 'Button 1 label', 'Listen along', '', 32),
				field('button1Url', 'Button 1 link', 'https://', '', 300),
			),
			group(
				'button2',
				field('button2Label', 'Button 2 label', '', '', 32),
				field('button2Url', 'Button 2 link', 'https://', '', 300),
			),
		),

		block(
			'Schedule',
			'Show this presence only on some days and between some times. Outside them it is taken off your profile by itself.',
			group(
				'schedule-on',
				toggleRow(
					'Use a schedule',
					'Off means it shows whenever it is switched on',
					!!profile.scheduleOn,
					scheduleOn => update({ scheduleOn }),
				),
			),
			profile.scheduleOn
				? group(
						'schedule',
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
			group(
				'only-when',
				field(
					'showOnlyWhen',
					'Show only when this has text',
					'{sc_title}',
					'Optional. Hides this presence while the text comes out empty. {sc_title} hides it when no SoundCloud track is playing.',
					128,
				),
			),
		),

		block(
			'Application ID',
			'Needed to show more than one presence at once. Each presence needs a different one.',
			group(
				'app-id',
				field(
					'applicationId',
					'Application ID',
					'Leave empty for a made-up one',
					'Leave it empty and one is made up for you. Only type one for image asset keys: create an application at discord.com/developers and paste its ID. The same ID in two presences makes Discord show them as one.',
					24,
				),
			),
		),

		block(
			'Variables',
			'Use these in any text box. They update on the refresh interval.',
			group(
				'variables',
				row(
					'{time} {time12} {seconds} {date} {day} {month} {year} {user} {username} {uptime}',
					'SoundCloud: {sc_title} {sc_artist} {sc_url} {sc_art} {sc_button}',
				),
			),
		),

		block(
			'Manage',
			undefined,
			group(
				'manage',
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
		),
	]

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
				spacing={32}
			>
				<Back title="All presences" onPress={onBack} />
				{parts}
			</Design.Stack>
		</ScrollView>
	)
}
