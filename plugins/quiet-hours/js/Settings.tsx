import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import {
	daysSetting,
	saveSettings,
	setStorage,
	setting,
	subscribe,
} from './config'
import {
	DAY_NAMES,
	DAY_SHORT,
	MAX_CUSTOM_TEXT,
	STATUS_CHOICES,
} from './constants'
import { diag } from './diag'
import { modeAt, onChange, skip, unskip } from './engine'
import {
	dayOf,
	daysText,
	durationText,
	isUsable,
	lengthOf,
	minuteText,
	whenOf,
} from './schedule'
import { openTimeSheet } from './TimeSheet'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { QuietSettings, QuietStatus } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: QuietSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Pick the nights and the hours. When they start, your status switches to Do Not Disturb (or the one you choose) and when they end your old status comes back. Skip tonight with one tap. It works whenever Discord is open: if the hours began while it was closed, they start a few seconds after you open it, and Discord itself ends the status on time.'
const STARTS = 'Starts'
const ENDS = 'Ends'
const WHAT_DAYS = 'The day a night starts on'
const DAYS_HELP =
	'A night belongs to the day it starts on, so Friday with 11 PM to 7 AM ends Saturday morning.'
const CUSTOM_LABEL = 'Custom status text'
const EMOJI_LABEL = 'Emoji'

/** The card at the top: what quiet hours are doing now, and the skip button. */
function NowCard() {
	const mode = modeAt()
	let title: string
	let line: string
	let color: 'text-normal' | 'text-brand' | 'text-muted' | 'text-danger' =
		'text-normal'
	let button: {
		text: string
		variant: 'primary' | 'secondary'
		run: () => void
	} | null = null

	if (mode.kind === 'on') {
		title = 'Quiet hours are on'
		line = `Until ${whenOf(mode.end)}`
		color = 'text-brand'
		button = {
			text: 'End now and skip tonight',
			variant: 'secondary',
			run: () => skip(),
		}
	} else if (mode.kind === 'next') {
		title = 'Next quiet hours'
		const hours = durationText(lengthOf(mode.window))
		line = `${whenOf(mode.window.start)} to ${whenOf(mode.window.end)} (${hours})`
		const soon = mode.window.start - Date.now() < 20 * 3_600_000
		button = {
			text: soon ? 'Skip tonight' : `Skip ${dayOf(mode.window.start)}`,
			variant: 'secondary',
			run: () => skip(),
		}
	} else if (mode.kind === 'skipped') {
		title = 'Skipping one night'
		line = `${whenOf(mode.window.start)} is skipped. The night after that is back on.`
		color = 'text-muted'
		button = { text: 'Undo skip', variant: 'primary', run: () => unskip() }
	} else if (mode.kind === 'invalid') {
		title = 'Nothing is scheduled'
		line = 'Turn on at least one day and make the two times different.'
		color = 'text-danger'
	} else {
		title = 'Quiet hours are off'
		line = 'Turn the schedule on below.'
		color = 'text-muted'
	}

	return (
		<Design.TableRowGroup title="Now">
			<Design.Card>
				<Design.Stack spacing={8}>
					<Design.Text variant="heading-lg/bold">{title}</Design.Text>
					<Design.Text variant="text-md/medium" color={color}>
						{line}
					</Design.Text>
					{button ? (
						<Design.Button
							text={button.text}
							variant={button.variant}
							onPress={button.run}
						/>
					) : null}
				</Design.Stack>
			</Design.Card>
		</Design.TableRowGroup>
	)
}

/** The seven day buttons: a filled one is a day a night starts on. */
function DayButtons() {
	const days = daysSetting()
	return (
		<View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16 }}>
			{days.map((on, index) => (
				<View key={DAY_NAMES[index]} style={{ flex: 1 }}>
					<Design.Button
						text={DAY_SHORT[index] as string}
						variant={on ? 'primary' : 'secondary'}
						size="sm"
						onPress={() => {
							const next = [...days]
							next[index] = !on
							saveSettings({ days: next })
							diag.log('schedule', `${DAY_NAMES[index]} ${on ? 'off' : 'on'}`)
						}}
					/>
				</View>
			))}
		</View>
	)
}

/** The settings screen: the schedule, the status to use, and the debugging section. */
export default function SettingsScreen({ api }: Props) {
	setStorage(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	useEffect(() => {
		const stopSaved = subscribe(() => redraw(n => n + 1))
		const stopState = onChange(() => redraw(n => n + 1))
		// The clock moves on, so the card is drawn again now and then.
		const tick = setInterval(() => redraw(n => n + 1), 30_000)
		return () => {
			stopSaved()
			stopState()
			clearInterval(tick)
		}
	}, [])

	const days = daysSetting()
	const from = Number(setting('from'))
	const to = Number(setting('to'))
	const status = setting('status') as QuietStatus
	const usable = isUsable(days, from, to)
	const crosses = to <= from
	const summary = `${daysText(days)}, ${minuteText(from)} to ${minuteText(to)}${crosses ? ' (next morning)' : ''}`
	const chosen = STATUS_CHOICES.find(c => c.v === status) ?? STATUS_CHOICES[0]

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<NowCard />
				<Design.TableRowGroup
					title="Schedule"
					description={usable ? summary : undefined}
				>
					<Design.TableSwitchRow
						label="Use the schedule"
						value={!!setting('enabled')}
						onValueChange={(value: boolean) => {
							saveSettings({ enabled: !!value })
							diag.log('schedule', value ? 'turned on' : 'turned off')
						}}
					/>
					<Design.TableRow
						label={STARTS}
						subLabel={minuteText(from)}
						arrow
						onPress={() => openTimeSheet('from', from)}
					/>
					<Design.TableRow
						label={ENDS}
						subLabel={`${minuteText(to)}${crosses ? ' (the next morning)' : ''}`}
						arrow
						onPress={() => openTimeSheet('to', to)}
					/>
				</Design.TableRowGroup>
				<Design.Stack spacing={8}>
					<Design.Text
						variant="text-xs/semibold"
						color="text-muted"
						style={{ paddingHorizontal: 16 }}
					>
						{WHAT_DAYS}
					</Design.Text>
					<DayButtons />
					<Design.Text
						variant="text-sm/medium"
						color="text-muted"
						style={{ paddingHorizontal: 16 }}
					>
						{DAYS_HELP}
					</Design.Text>
				</Design.Stack>
				<Design.TableRowGroup
					title="Status during quiet hours"
					description={chosen?.help}
				>
					<Design.TableRadioGroup
						defaultValue={status}
						onChange={(value: string) =>
							saveSettings({ status: value as QuietStatus })
						}
					>
						{STATUS_CHOICES.map(choice => (
							<Design.TableRadioRow
								key={choice.v}
								value={choice.v}
								label={choice.l}
							/>
						))}
					</Design.TableRadioGroup>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Custom status">
					<Design.TableSwitchRow
						label="Show a custom status too"
						subLabel="Your old custom status comes back afterwards."
						value={!!setting('showCustom')}
						onValueChange={(value: boolean) =>
							saveSettings({ showCustom: !!value })
						}
					/>
				</Design.TableRowGroup>
				{setting('showCustom') ? (
					<View style={{ paddingHorizontal: 16, gap: 10 }}>
						<Design.TextInput
							label={EMOJI_LABEL}
							placeholder="🌙"
							size="md"
							value={String(setting('customEmoji') || '')}
							onChange={(value: string) => saveSettings({ customEmoji: value })}
						/>
						<Design.TextInput
							label={CUSTOM_LABEL}
							placeholder="Quiet hours"
							size="md"
							maxLength={MAX_CUSTOM_TEXT}
							value={String(setting('customText') || '')}
							onChange={(value: string) => saveSettings({ customText: value })}
						/>
					</View>
				) : null}
				<Design.TableRowGroup title="Options">
					<Design.TableSwitchRow
						label="Vibrate when quiet hours begin or end"
						value={!!setting('buzz')}
						onValueChange={(value: boolean) => saveSettings({ buzz: !!value })}
					/>
				</Design.TableRowGroup>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
