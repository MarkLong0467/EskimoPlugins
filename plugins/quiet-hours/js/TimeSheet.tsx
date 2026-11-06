import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import { saveSettings } from './config'
import { MINUTE_CHOICES, TIME_SHEET_KEY } from './constants'
import { diag } from './diag'
import { sheets } from './discord'
import { minuteText } from './schedule'
import type { MinuteOfDay } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const HOUR_TITLE = 'Hour'
const MINUTE_TITLE = 'Minute'
const SAVE = 'Save'
const CANCEL = 'Cancel'
const AM = 'AM'
const PM = 'PM'

/** The hours of a 12-hour clock, in the rows they are shown in. */
const HOUR_ROWS = [
	[12, 1, 2, 3],
	[4, 5, 6, 7],
	[8, 9, 10, 11],
]

/** Closes the sheet. */
function close(): void {
	try {
		sheets().hideActionSheet(TIME_SHEET_KEY)
	} catch {
		// The sheet is already gone.
	}
}

/** Opens the sheet that picks the time quiet hours start (`from`) or end (`to`). */
export function openTimeSheet(which: 'from' | 'to', minute: MinuteOfDay): void {
	try {
		sheets().openLazy(
			Promise.resolve({
				default: () => <TimeSheet which={which} minute={minute} />,
			}),
			TIME_SHEET_KEY,
			{},
		)
	} catch (error) {
		diag.fail('sheet', error)
	}
}

/** One button of the picker; the chosen one is filled in. */
function Choice({
	text,
	chosen,
	onPress,
}: {
	text: string
	chosen: boolean
	onPress: () => void
}) {
	return (
		<View style={{ flex: 1 }}>
			<Design.Button
				text={text}
				variant={chosen ? 'primary' : 'secondary'}
				size="sm"
				onPress={onPress}
			/>
		</View>
	)
}

/** The sheet that picks a time of day: the hour, the minute (every 15) and AM or PM. */
function TimeSheet({
	which,
	minute,
}: {
	which: 'from' | 'to'
	minute: MinuteOfDay
}) {
	const h24 = Math.floor(minute / 60) % 24
	const [hour, setHour] = useState(h24 % 12 === 0 ? 12 : h24 % 12)
	const [mins, setMins] = useState(
		MINUTE_CHOICES.includes(minute % 60)
			? minute % 60
			: (MINUTE_CHOICES.find(m => m >= minute % 60) ?? 0),
	)
	const [pm, setPm] = useState(h24 >= 12)

	const value: MinuteOfDay = ((hour % 12) + (pm ? 12 : 0)) * 60 + mins
	const title = which === 'from' ? 'Start quiet hours at' : 'End quiet hours at'
	const preview = minuteText(value)

	return (
		<Design.ActionSheet>
			<View style={{ padding: 16, gap: 12 }}>
				<Design.Text variant="heading-lg/bold">{title}</Design.Text>
				<Design.Text variant="heading-xl/bold" color="text-brand">
					{preview}
				</Design.Text>
				<Design.Text variant="text-md/semibold">{HOUR_TITLE}</Design.Text>
				{HOUR_ROWS.map(row => (
					<View key={row.join('-')} style={{ flexDirection: 'row', gap: 8 }}>
						{row.map(h => (
							<Choice
								key={h}
								text={String(h)}
								chosen={h === hour}
								onPress={() => setHour(h)}
							/>
						))}
					</View>
				))}
				<Design.Text variant="text-md/semibold">{MINUTE_TITLE}</Design.Text>
				<View style={{ flexDirection: 'row', gap: 8 }}>
					{MINUTE_CHOICES.map(m => (
						<Choice
							key={m}
							text={m < 10 ? `0${m}` : String(m)}
							chosen={m === mins}
							onPress={() => setMins(m)}
						/>
					))}
				</View>
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<Choice text={AM} chosen={!pm} onPress={() => setPm(false)} />
					<Choice text={PM} chosen={pm} onPress={() => setPm(true)} />
				</View>
				<Design.Button
					text={SAVE}
					variant="primary"
					onPress={() => {
						saveSettings(which === 'from' ? { from: value } : { to: value })
						diag.log('schedule', `${which} set to ${preview}`)
						close()
					}}
				/>
				<Design.Button text={CANCEL} variant="secondary" onPress={close} />
			</View>
		</Design.ActionSheet>
	)
}
