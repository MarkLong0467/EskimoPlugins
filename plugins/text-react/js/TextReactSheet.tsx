import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { createContext, createElement, useContext, useState } from 'react'
import { View } from 'react-native'
import { newReactions, reactionCapacity } from './capacity'
import { setting } from './config'
import { MAX_REACTIONS, SHEET_KEY } from './constants'
import { motionContext, toast } from './discord'
import { generateEmojiArray } from './emoji'
import { addReactions } from './reactions'
import type { MotionValue } from './discord'
import type { Target } from './types'

/** Stands in for the accessibility context when Discord's cannot be found, so the hook is always called. */
const FALLBACK_CONTEXT = createContext<MotionValue>(undefined)

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
	const Motion = motionContext()
	const accessibility = useContext(Motion ?? FALLBACK_CONTEXT)
	const [confirm, setConfirm] = useState<string[] | null>(null)

	// How full the message is, read again each time the sheet draws.
	const room = reactionCapacity(target)
	const fits = room
		? `Up to ${room.left} different reactions fit on this message`
		: ''
	const counted = room ? `${room.used}/${MAX_REACTIONS} reactions` : ''

	/** Closes the sheet and adds the reactions in the background. */
	const go = (emoji: string[]) => {
		close()
		addReactions(target, emoji)
	}

	const react = () => {
		const { emoji, incomplete } = generateEmojiArray(text.trim(), {
			custom: setting('customWords'),
			hidden: setting('hiddenDefaults'),
			overrides: setting('overrides'),
		})
		if (!emoji.length)
			return toast('None of that text can be turned into reactions')
		const fresh = room ? newReactions(emoji, room) : emoji.length
		if (room ? fresh > room.left : emoji.length > MAX_REACTIONS)
			return toast(
				room
					? `Only ${room.left} more different reactions fit on this message, and this text needs ${fresh}`
					: `That is ${emoji.length} reactions. A message holds at most ${MAX_REACTIONS}`,
			)
		if (incomplete && setting('warn')) return setConfirm(emoji)
		go(emoji)
	}

	const sheet = (
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
						{room ? (
							<>
								<Design.Text variant="text-sm/medium" color="text-muted">
									{fits}
								</Design.Text>
								<Design.Text variant="text-sm/medium" color="text-muted">
									{counted}
								</Design.Text>
							</>
						) : null}
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

	// With the animation off the sheet is told that reduced motion is on, which makes it appear at once.
	if (setting('animate') === false && Motion)
		return createElement(
			Motion.Provider,
			{
				value: {
					...accessibility,
					reducedMotion: { ...accessibility?.reducedMotion, enabled: true },
				},
			},
			sheet,
		)
	return sheet
}
