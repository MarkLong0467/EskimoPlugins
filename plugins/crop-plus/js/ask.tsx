import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useEffect } from 'react'
import { Image, View } from 'react-native'
import { setting } from './config'
import { SHEET_KEY } from './constants'
import { dims, sizeText } from './format'
import { problem, run } from './state'
import type { Choice, CropResult } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const TITLE = 'Crop smaller?'
const AGAIN = 'Crop smaller'
const DONE = 'Use this one'
const CANCEL = 'Cancel (keep the original)'

interface Props {
	/** The results of the passes so far; the last one is shown. */
	stack: CropResult[]
	/** Gives the answer back. */
	finish: (choice: Choice) => void
}

/**
 * The sheet that asks whether to crop again: it shows the last result, and buttons to crop smaller, use this one, go
 * back one crop (from the second crop on, if the setting allows it) or cancel everything. Closing the sheet without a
 * choice counts as "use this one".
 */
function AskSheet({ stack, finish }: Props) {
	// When the sheet goes away without an answer, the answer is "use this one".
	useEffect(
		() => () => {
			if (run.answerWith === finish) finish('done')
		},
		[],
	)
	const last = stack[stack.length - 1]
	const before = stack.length > 1 ? stack[stack.length - 2] : null
	const uri = last && (last.path || last.uri)
	const summary = `Crop ${stack.length}: ${dims(last)}${last?.size ? ` · ${sizeText(last.size)}` : ''}. Crop again to go smaller. Each crop starts from the picture you just made.`
	const back = `Go back to ${dims(before)}`

	return (
		<Design.ActionSheet>
			<View style={{ padding: 16, gap: 12 }}>
				<Design.Text variant="heading-lg/bold">{TITLE}</Design.Text>
				<Design.Text variant="text-sm/medium" color="text-muted">
					{summary}
				</Design.Text>
				{uri ? (
					<View
						style={{
							height: 170,
							borderRadius: 12,
							overflow: 'hidden',
							backgroundColor: '#1e1f22',
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<Image
							source={{ uri }}
							style={{ width: '100%', height: '100%' }}
							resizeMode="contain"
						/>
					</View>
				) : null}
				<Design.Button
					text={AGAIN}
					variant="primary"
					onPress={() => finish('again')}
				/>
				<Design.Button
					text={DONE}
					variant="secondary"
					onPress={() => finish('done')}
				/>
				{before && setting('undoStack') ? (
					<Design.Button
						text={back}
						variant="secondary"
						size="sm"
						onPress={() => finish('undo')}
					/>
				) : null}
				<Design.Button
					text={CANCEL}
					variant="destructive"
					size="sm"
					onPress={() => finish('cancel')}
				/>
			</View>
		</Design.ActionSheet>
	)
}

/**
 * Shows the sheet and waits for a choice.
 *
 * @param stack The results of the passes so far.
 * @returns `again`, `done`, `undo` or `cancel`. If the sheet cannot be shown, `done`.
 */
export function askAgain(stack: CropResult[]): Promise<Choice> {
	return new Promise(resolve => {
		let settled = false
		const finish = (choice: Choice) => {
			if (settled) return
			settled = true
			run.answerWith = null
			try {
				ActionSheetActionCreators.hideActionSheet(SHEET_KEY)
			} catch {
				// The sheet is already gone.
			}
			resolve(choice)
		}
		run.answerWith = finish as (choice: 'done') => void
		try {
			ActionSheetActionCreators.openLazy(
				Promise.resolve({
					default: () => <AskSheet stack={stack} finish={finish} />,
				}),
				SHEET_KEY,
				{},
			)
		} catch (error) {
			problem('crop again sheet', error)
			finish('done')
		}
	})
}
