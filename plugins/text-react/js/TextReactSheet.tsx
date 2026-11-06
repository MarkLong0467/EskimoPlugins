import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import { setting } from './config'
import { MAX_REACTIONS, SHEET_KEY } from './constants'
import { toast } from './discord'
import { generateEmojiArray } from './emoji'
import { addReactions } from './reactions'
import type { Target } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const TITLE = 'Text React'
const HELP =
	'Type some text. It is added to the message as reactions, one at a time.'
const WARNING =
	'Part of the text has no emoji, so it would be left out. React anyway?'
const REACT = 'React'
const BACK = 'Go back'
const CANCEL = 'Cancel'
const ANYWAY = 'React anyway'

/** Closes the sheet. */
function close(): void {
	try {
		ActionSheetActionCreators.hideActionSheet(SHEET_KEY)
	} catch {
		// The sheet is already gone.
	}
}

/**
 * The sheet that asks for the text.
 *
 * "React" turns the text into emoji. If all of it could be turned into emoji (or the warning is switched off) the
 * reactions are added right away. Otherwise the sheet asks once whether to go on without the characters that have no
 * emoji. Texts with more emoji than a message can hold (20) are refused.
 */
export default function TextReactSheet({ target }: { target: Target }) {
	const [text, setText] = useState('')
	const [confirm, setConfirm] = useState<string[] | null>(null)

	/** Closes the sheet and adds the reactions in the background. */
	const go = (emoji: string[]) => {
		close()
		addReactions(target, emoji)
	}

	const react = () => {
		const { emoji, incomplete } = generateEmojiArray(text.trim())
		if (!emoji.length)
			return toast('None of that text can be turned into reactions')
		if (emoji.length > MAX_REACTIONS)
			return toast(
				`That is ${emoji.length} reactions. A message holds at most ${MAX_REACTIONS}`,
			)
		if (incomplete && setting('warn')) return setConfirm(emoji)
		go(emoji)
	}

	return (
		<Design.ActionSheet>
			<View style={{ padding: 16, gap: 12 }}>
				<Design.Text variant="heading-lg/bold">{TITLE}</Design.Text>
				{confirm ? (
					<>
						<Design.Text variant="text-md/medium">{WARNING}</Design.Text>
						<Design.Button
							text={ANYWAY}
							variant="primary"
							onPress={() => go(confirm)}
						/>
						<Design.Button
							text={BACK}
							variant="secondary"
							onPress={() => setConfirm(null)}
						/>
					</>
				) : (
					<>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{HELP}
						</Design.Text>
						<Design.TextInput
							label="Text"
							placeholder="Enter text..."
							size="md"
							value={text}
							onChange={setText}
							autoFocus
						/>
						<Design.Button
							text={REACT}
							variant="primary"
							disabled={!text.trim()}
							onPress={react}
						/>
						<Design.Button
							text={CANCEL}
							variant="secondary"
							onPress={() => {
								close()
								toast('Cancelled')
							}}
						/>
					</>
				)}
			</View>
		</Design.ActionSheet>
	)
}
