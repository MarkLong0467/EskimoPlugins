import { useState } from 'react'
import {
	END_PRESETS,
	endFromLength,
	formatDuration,
	formatElapsed,
	parseLengthInput,
	parseStartInput,
	START_PRESETS,
	sessionLength,
} from '../../lib/elapsed'
import { getSettings, setSettings } from '../../lib/state'
import { ELAPSED_END_SHEET_KEY, ELAPSED_TIME_SHEET_KEY } from '../sheetKeys'

type Field = 'start' | 'end'

function ActionSheet() {
	return valenced.discord.actions?.ActionSheetActionCreators
}

const { View } = valenced.react.ReactNative

function closeSheet(field: Field) {
	try {
		ActionSheet()?.hideActionSheet?.(keyFor(field))
	} catch {}
}

function keyFor(field: Field) {
	return field === 'end' ? ELAPSED_END_SHEET_KEY : ELAPSED_TIME_SHEET_KEY
}

/** Render a stored value as the text the user would have typed. */
function describe(value: number, isEnd: boolean): string {
	if (!value) return ''
	// End mode edits a total length, so it is shown as a plain span.
	if (isEnd) return formatDuration(value)
	return `-${formatDuration(Date.now() - value)}`
}

function ElapsedTimeSheet({ field }: { field: Field }) {
	const Design = valenced.discord.design.Design as any
	const {
		ActionSheet: AS,
		BottomSheetTitleHeader,
		TableRadioGroup,
		TableRadioRow,
		TableRowGroup,
		TableRow,
		Text,
		TextInput,
	} = Design

	const settings = getSettings()
	const isEnd = field === 'end'
	// End mode edits the *total* session length, which is what makes the pair
	// coherent: the stored epoch is always derived as start + length.
	const current = isEnd
		? sessionLength(settings.timestampStart, settings.timestampEnd)
		: settings.timestampStart
	const presets = isEnd ? END_PRESETS : START_PRESETS

	// Prefilled from storage: a blank field on reopen made it look like the entry
	// had been thrown away.
	const [custom, setCustom] = useState(() => describe(current, isEnd))
	const [error, setError] = useState<string | null>(null)

	// Presets are relative to when the sheet opened, so a stored value only counts
	// as a match while it is still close to one of them. End mode already holds
	// a length, so only the start needs converting to a relative offset.
	const target = isEnd ? current : Date.now() - current
	const chosen =
		isEnd && current === 0
			? 'None'
			: (presets.find(preset => Math.abs(target - preset.ms) < 90_000)?.label ??
				'')

	const commit = (value: number) => {
		if (isEnd) {
			setSettings({
				timestampEnd: endFromLength(settings.timestampStart, value),
			})
			return
		}
		// Moving the start has to carry the end along. Leaving the old end in
		// place would put it in front of the new start, and the card would render
		// a nonsensical span.
		const length = sessionLength(settings.timestampStart, settings.timestampEnd)
		setSettings({
			timestampStart: value,
			timestampEnd:
				length > 0 ? endFromLength(value, length) : settings.timestampEnd,
		})
	}

	const applyCustom = () => {
		const parsed = isEnd
			? parseLengthInput(custom, settings.timestampStart)
			: parseStartInput(custom)
		if (parsed === null) {
			setError('Try 1d 7h 20m 40s, 90m, 45 or 14:30')
			return
		}
		setError(null)
		commit(parsed)
		closeSheet(field)
	}

	const summary = isEnd
		? current > 0
			? `Currently ${formatDuration(current)} total`
			: 'Currently None'
		: `Currently ${formatElapsed(current)}`

	return (
		<AS>
			<BottomSheetTitleHeader title={isEnd ? 'End Time' : 'Start Time'} />

			<TableRadioGroup
				value={chosen}
				onChange={(label: any) => {
					const preset = presets.find(p => p.label === label)
					if (!preset) return
					// End presets are total lengths, so they commit verbatim.
					commit(isEnd ? preset.ms : Date.now() - preset.ms)
					closeSheet(field)
				}}
			>
				{presets.map(preset => (
					<TableRadioRow
						key={preset.label}
						value={preset.label}
						label={preset.label}
					/>
				))}
			</TableRadioGroup>

			<TableRowGroup title="Custom">
				<TableRow
					label={
						<View style={{ flex: 1, gap: 4, paddingVertical: 4 }}>
							<Text variant="text-md/semibold">Duration or time</Text>
							<TextInput
								placeholder="1d 7h 20m 40s  ·  14:30"
								value={custom}
								onChange={(text: string) => {
									setCustom(text)
									if (error) setError(null)
									// Apply as it is typed so the sheet does not need a
									// separate confirm to take effect.
									const live = isEnd
										? parseLengthInput(text, settings.timestampStart)
										: parseStartInput(text)
									if (live !== null) commit(live)
								}}
								onSubmitEditing={applyCustom}
							/>
							<Text variant="text-sm/medium" color="text-muted">
								{error ??
									(isEnd
										? 'Total length — the start counts down from it'
										: 'Counts back from now')}
							</Text>
						</View>
					}
				/>
			</TableRowGroup>

			<TableRowGroup>
				<TableRow
					label={<Text variant="text-md/semibold">Save</Text>}
					onPress={applyCustom}
				/>
				<TableRow
					label={
						<Text variant="text-md/medium" color="text-muted">
							{summary}
						</Text>
					}
					onPress={() => {
						commit(isEnd ? 0 : Date.now())
						closeSheet(field)
					}}
				/>
			</TableRowGroup>
		</AS>
	)
}

function makeSheet(field: Field) {
	return function ElapsedTimeSheetForField() {
		return <ElapsedTimeSheet field={field} />
	}
}

function open(field: Field) {
	try {
		ActionSheet()?.openLazy?.(
			Promise.resolve({ default: makeSheet(field) }),
			keyFor(field),
			{ sheetKey: keyFor(field) } as any,
		)
	} catch {}
}

export function openElapsedTimePicker() {
	open('start')
}

export function openElapsedEndPicker() {
	open('end')
}
