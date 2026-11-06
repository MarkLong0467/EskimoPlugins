import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Alert, ScrollView } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { saveSettings, setStorage, setting } from './config'
import { SNOOZE_CHOICES } from './constants'
import { diag } from './diag'
import { openItemSheet } from './ItemSheet'
import { all, clear, subscribe } from './reminders'
import { relativeOf, whenOf } from './time'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Reminder, ReminderSettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: ReminderSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Hold a message and tap Remind Me to pick a time. When it comes, a sheet shows the message so you can jump back to it, snooze it or mark it done. Reminders can only come while Discord is open: ones that came due while it was closed show up when you next open it.'
const EMPTY_TITLE = 'No reminders yet'
const EMPTY_HELP = 'Hold a message and tap Remind Me.'

/** The row of one reminder: who wrote the message, the start of it, and when it is. */
function ReminderRow({ reminder }: { reminder: Reminder }) {
	const overdue = reminder.at <= Date.now()
	const label = reminder.preview || reminder.author || 'A message'
	const who = reminder.author ? `${reminder.author} · ` : ''
	const when = overdue
		? `Due ${relativeOf(reminder.at)}`
		: `${whenOf(reminder.at)} · ${relativeOf(reminder.at)}`
	return (
		<Design.TableRow
			label={label}
			labelLineClamp={2}
			subLabel={`${who}${when}`}
			arrow
			onPress={() => openItemSheet(reminder.id)}
		/>
	)
}

/** The settings screen: the reminders, the options and the debugging section. */
export default function SettingsScreen({ api }: Props) {
	setStorage(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	useEffect(() => subscribe(() => redraw(n => n + 1)), [])

	const now = Date.now()
	const list = all()
	const overdue = list.filter(r => r.at <= now)
	const coming = list.filter(r => r.at > now)
	const snooze = Number(setting('snoozeMinutes')) || 10

	const confirmClear = () =>
		Alert.alert(
			'Remove every reminder?',
			'This cannot be undone.',
			[
				{ text: 'Keep them', style: 'cancel' },
				{
					text: 'Remove all',
					style: 'destructive',
					onPress: () => {
						clear()
						diag.log('reminder', 'all removed')
					},
				},
			],
			{ cancelable: true },
		)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				{list.length === 0 ? (
					<Design.TableRowGroup title="Reminders">
						<Design.TableRow label={EMPTY_TITLE} subLabel={EMPTY_HELP} />
					</Design.TableRowGroup>
				) : null}
				{overdue.length > 0 ? (
					<Design.TableRowGroup title={`Due now (${overdue.length})`}>
						{overdue.map(r => (
							<ReminderRow key={r.id} reminder={r} />
						))}
					</Design.TableRowGroup>
				) : null}
				{coming.length > 0 ? (
					<Design.TableRowGroup title={`Coming up (${coming.length})`}>
						{coming.map(r => (
							<ReminderRow key={r.id} reminder={r} />
						))}
					</Design.TableRowGroup>
				) : null}
				<Design.TableRowGroup title="Options">
					<Design.TableSwitchRow
						label="Show Remind Me in the message menu"
						value={!!setting('menu')}
						onValueChange={(value: boolean) => saveSettings({ menu: !!value })}
					/>
					<Design.TableSwitchRow
						label="Open a sheet when a reminder is due"
						subLabel="A toast always shows. The sheet has Jump, Snooze and Done."
						value={!!setting('sheet')}
						onValueChange={(value: boolean) => saveSettings({ sheet: !!value })}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup
					title="Snooze for"
					description={`Snooze adds ${snooze} minutes.`}
				>
					<Design.TableRadioGroup
						defaultValue={String(snooze)}
						onChange={(value: string) =>
							saveSettings({ snoozeMinutes: Number(value) })
						}
					>
						{SNOOZE_CHOICES.map(minutes => (
							<Design.TableRadioRow
								key={minutes}
								value={String(minutes)}
								label={minutes === 60 ? '1 hour' : `${minutes} minutes`}
							/>
						))}
					</Design.TableRadioGroup>
				</Design.TableRowGroup>
				{list.length > 0 ? (
					<Design.TableRowGroup>
						<Design.TableRow
							label="Remove every reminder"
							variant="danger"
							onPress={confirmClear}
						/>
					</Design.TableRowGroup>
				) : null}
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
