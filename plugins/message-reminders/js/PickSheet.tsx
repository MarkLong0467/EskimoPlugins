import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import { MAX_MINUTES, PICK_SHEET_KEY } from './constants'
import { diag } from './diag'
import { sheets, toast } from './discord'
import { add, forMessage, remove } from './reminders'
import { afterMinutes, choices, whenOf } from './time'
import type { Target } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const TITLE = 'Remind me about this message'
const NO_TEXT = '(no text, maybe a picture or file)'
const CUSTOM_TITLE = 'Another time'
const CUSTOM_HELP = 'Type how many minutes from now. 90 is an hour and a half.'
const CANCEL = 'Cancel'
const REMOVE = 'Remove the reminder'
const SET = 'Set reminder'

/** Closes the sheet. */
function close(): void {
	try {
		sheets().hideActionSheet(PICK_SHEET_KEY)
	} catch {
		// The sheet is already gone.
	}
}

/**
 * The sheet that picks when to be reminded of a message: a few usual times, or a number of minutes. A message has one
 * reminder, so picking again moves it, and it can be removed here.
 */
export default function PickSheet({ target }: { target: Target }) {
	const [minutes, setMinutes] = useState('')
	const existing = forMessage(target.channelId, target.messageId)
	const preview = target.preview || NO_TEXT
	const author = target.author || 'Someone'
	const byline = `${author}: ${preview}`
	const current = existing ? `Reminder set for ${whenOf(existing.at)}` : ''
	const customAt = afterMinutes(minutes, MAX_MINUTES)
	const customLine = customAt ? `That is ${whenOf(customAt)}` : CUSTOM_HELP

	/** Sets the reminder and closes the sheet. */
	const pick = (at: number) => {
		const { replaced } = add(target, at)
		diag.log('reminder', `${replaced ? 'moved' : 'set'} for ${whenOf(at)}`)
		close()
		toast(`${replaced ? 'Moved to' : 'Reminder set for'} ${whenOf(at)}`)
	}

	return (
		<Design.ActionSheet>
			<View style={{ padding: 16, gap: 12 }}>
				<Design.Text variant="heading-lg/bold">{TITLE}</Design.Text>
				<Design.Text variant="text-sm/medium" color="text-muted" lineClamp={3}>
					{byline}
				</Design.Text>
				{existing ? (
					<Design.Text variant="text-sm/medium" color="text-brand">
						{current}
					</Design.Text>
				) : null}
				<Design.TableRowGroup>
					{choices().map(choice => (
						<Design.TableRow
							key={choice.label}
							label={choice.label}
							subLabel={whenOf(choice.at)}
							arrow
							onPress={() => pick(choice.at)}
						/>
					))}
				</Design.TableRowGroup>
				<Design.Text variant="text-md/semibold">{CUSTOM_TITLE}</Design.Text>
				<Design.TextInput
					label="Minutes from now"
					placeholder="45"
					size="md"
					value={minutes}
					onChange={(value: string) => setMinutes(value.replace(/[^0-9]/g, ''))}
				/>
				<Design.Text variant="text-sm/medium" color="text-muted">
					{customLine}
				</Design.Text>
				<Design.Button
					text={SET}
					variant="primary"
					disabled={customAt === null}
					onPress={() => customAt !== null && pick(customAt)}
				/>
				{existing ? (
					<Design.Button
						text={REMOVE}
						variant="destructive"
						onPress={() => {
							remove(existing.id)
							diag.log('reminder', 'removed from the picker')
							close()
							toast('Reminder removed')
						}}
					/>
				) : null}
				<Design.Button text={CANCEL} variant="secondary" onPress={close} />
			</View>
		</Design.ActionSheet>
	)
}
