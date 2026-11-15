/** A sheet that asks for one or more pieces of text, for naming, scheduling and pasting. */

import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { describeError } from './api'
import { newId } from './constants'
import { hideSheets, openSheet } from './discord'

/** The key the sheet opens with. */
export const PROMPT_SHEET_KEY = 'WebhookBuilderPrompt'

export interface PromptField {
	key: string
	label: string
	value?: string
	placeholder?: string
	description?: string
	multiline?: boolean
}

export interface Prompt {
	title: string
	/** A line under the title. */
	note?: string
	fields: PromptField[]
	/** The text of the button. */
	submit: string
	/**
	 * Does what was asked. Throwing (or rejecting) shows the error in the sheet and keeps it open; otherwise it closes.
	 */
	onSubmit: (values: Record<string, string>) => unknown
}

/** The sheet. */
export function PromptSheet({ prompt }: { prompt: Prompt }) {
	const [values, setValues] = useState<Record<string, string>>(() =>
		Object.fromEntries(prompt.fields.map(f => [f.key, f.value ?? ''])),
	)
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	const submit = async () => {
		if (busy) return
		setBusy(true)
		setError('')
		try {
			await prompt.onSubmit(values)
			hideSheets()
		} catch (e) {
			setError(describeError(e))
		} finally {
			setBusy(false)
		}
	}
	return (
		<Design.ActionSheet>
			<Design.BottomSheetTitleHeader title={prompt.title} />
			<ScrollView
				style={{ maxHeight: 560 }}
				keyboardShouldPersistTaps="handled"
			>
				<View style={{ padding: 16, gap: 12 }}>
					{prompt.note ? (
						<Design.Text variant="text-sm/medium" color="text-muted">
							{prompt.note}
						</Design.Text>
					) : null}
					{prompt.fields.map(f => {
						const Input = ((f.multiline && Design.TextArea) ||
							Design.TextInput) as typeof Design.TextInput
						return (
							<Input
								key={f.key}
								label={f.label}
								placeholder={f.placeholder}
								description={f.description}
								value={values[f.key] ?? ''}
								size="md"
								onChange={(next: string) =>
									setValues(v => ({ ...v, [f.key]: next }))
								}
							/>
						)
					})}
					{error ? (
						<Design.Text variant="text-sm/medium" color="text-danger">
							{error}
						</Design.Text>
					) : null}
					<Design.Button
						text={prompt.submit}
						variant="primary"
						loading={busy}
						onPress={submit}
					/>
					<Design.Button
						text="Cancel"
						variant="secondary"
						onPress={hideSheets}
					/>
				</View>
			</ScrollView>
		</Design.ActionSheet>
	)
}

/** Opens the sheet. Each one is new, so nothing typed into an earlier one is left in it. */
export function ask(prompt: Prompt): void {
	const key = newId()
	openSheet(PROMPT_SHEET_KEY, () => <PromptSheet key={key} prompt={prompt} />)
}
