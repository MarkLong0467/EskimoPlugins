import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { ButtonRow, ReminderCard, RowButton } from './components'
import { setting } from './config'
import { ITEM_SHEET_KEY } from './constants'
import { diag } from './diag'
import { jumpTo, sheets, toast } from './discord'
import { all, remove, snooze, subscribe } from './reminders'

/** Texts as constants because React Native text must be passed as an expression. */
const GONE = 'This reminder is gone.'
const JUMP = 'Jump to message'
const REMOVE = 'Remove'
const CLOSE = 'Close'

/** Closes the sheet. */
function close(): void {
	try {
		sheets().hideActionSheet(ITEM_SHEET_KEY)
	} catch {
		// The sheet is already gone.
	}
}

/** Opens the sheet for one reminder from the settings. */
export function openItemSheet(id: string): void {
	try {
		sheets().openLazy(
			Promise.resolve({ default: () => <ItemSheet id={id} /> }),
			ITEM_SHEET_KEY,
			{},
		)
	} catch (error) {
		diag.fail('sheet', error)
	}
}

/** The sheet for one reminder: where it points and what to do with it. */
function ItemSheet({ id }: { id: string }) {
	const [, redraw] = useState(0)
	useEffect(() => subscribe(() => redraw(n => n + 1)), [])
	const reminder = all().find(r => r.id === id)
	const minutes = Number(setting('snoozeMinutes')) || 10
	const snoozeText = `Snooze ${minutes} min`

	return (
		<Design.ActionSheet>
			<View style={{ padding: 16, gap: 12 }}>
				{reminder ? (
					<ReminderCard reminder={reminder}>
						<ButtonRow>
							<RowButton
								text={JUMP}
								variant="primary"
								onPress={async () => {
									if (await jumpTo(reminder)) close()
									else toast('Could not open the message')
								}}
							/>
						</ButtonRow>
						<ButtonRow>
							<RowButton
								text={snoozeText}
								variant="secondary"
								onPress={() => {
									snooze(
										reminder.id,
										Math.max(Date.now(), reminder.at) + minutes * 60_000,
									)
									toast(`Moved ${minutes} min later`)
								}}
							/>
							<RowButton
								text={REMOVE}
								variant="destructive"
								onPress={() => {
									remove(reminder.id)
									diag.log('reminder', 'removed from the settings')
									close()
								}}
							/>
						</ButtonRow>
					</ReminderCard>
				) : (
					<Design.Text variant="text-md/medium">{GONE}</Design.Text>
				)}
				<Design.Button text={CLOSE} variant="secondary" onPress={close} />
			</View>
		</Design.ActionSheet>
	)
}
