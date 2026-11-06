import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { ButtonRow, ReminderCard, RowButton } from './components'
import { setting } from './config'
import { DUE_SHEET_KEY, DUE_SHOWN } from './constants'
import { diag } from './diag'
import { jumpTo, sheets, toast } from './discord'
import { due, remove, snooze, subscribe } from './reminders'

/** Texts as constants because React Native text must be passed as an expression. */
const TITLE = 'Reminder'
const DONE = 'Done'
const JUMP = 'Jump to message'

/** Whether the sheet is on screen, so a second one is not opened on top of it. */
let open = false

/** Whether the due sheet is on screen. */
export function isDueSheetOpen(): boolean {
	return open
}

/** Closes the sheet. */
function close(): void {
	try {
		sheets().hideActionSheet(DUE_SHEET_KEY)
	} catch {
		// The sheet is already gone.
	}
}

/** Opens the sheet that lists the reminders that are due. Does nothing if it is already open. */
export function openDueSheet(): void {
	if (open) return
	open = true
	try {
		sheets().openLazy(Promise.resolve({ default: DueSheet }), DUE_SHEET_KEY, {})
	} catch (error) {
		open = false
		diag.fail('sheet', error)
	}
}

/**
 * The sheet shown when reminders are due: each one with Jump, Snooze and Done. It follows the list, so a reminder that is
 * dealt with disappears from it, and the sheet closes when none are left.
 */
export default function DueSheet() {
	const [, redraw] = useState(0)
	useEffect(() => {
		open = true
		const stop = subscribe(() => redraw(n => n + 1))
		return () => {
			stop()
			open = false
		}
	}, [])

	const items = due()
	useEffect(() => {
		if (items.length === 0) close()
	}, [items.length])

	const minutes = Number(setting('snoozeMinutes')) || 10
	const more = items.length - DUE_SHOWN
	const moreLine = `${more} more in the settings`
	const snoozeText = `Snooze ${minutes} min`

	/** Runs what a button does. An error, even one thrown later by an async action, is noted instead of lost. */
	const dealWith = (what: () => void | Promise<void>) => {
		try {
			Promise.resolve(what()).catch(error => diag.fail('reminder', error))
		} catch (error) {
			diag.fail('reminder', error)
		}
	}

	return (
		<Design.ActionSheet>
			<ScrollView style={{ maxHeight: 560 }}>
				<View style={{ padding: 16, gap: 12 }}>
					<Design.Text variant="heading-lg/bold">{TITLE}</Design.Text>
					{items.slice(0, DUE_SHOWN).map(reminder => (
						<ReminderCard key={reminder.id} reminder={reminder}>
							<ButtonRow>
								<RowButton
									text={JUMP}
									variant="primary"
									onPress={() =>
										dealWith(async () => {
											const ok = await jumpTo(reminder)
											if (!ok) return toast('Could not open the message')
											diag.log('reminder', 'jumped to the message')
											remove(reminder.id)
											close()
										})
									}
								/>
							</ButtonRow>
							<ButtonRow>
								<RowButton
									text={snoozeText}
									variant="secondary"
									onPress={() =>
										dealWith(() => {
											snooze(reminder.id, Date.now() + minutes * 60_000)
											diag.log('reminder', `snoozed ${minutes} min`)
											toast(`Snoozed for ${minutes} min`)
										})
									}
								/>
								<RowButton
									text={DONE}
									variant="tertiary"
									onPress={() =>
										dealWith(() => {
											remove(reminder.id)
											diag.log('reminder', 'done')
										})
									}
								/>
							</ButtonRow>
						</ReminderCard>
					))}
					{more > 0 ? (
						<Design.Text variant="text-sm/medium" color="text-muted">
							{moreLine}
						</Design.Text>
					) : null}
				</View>
			</ScrollView>
		</Design.ActionSheet>
	)
}
