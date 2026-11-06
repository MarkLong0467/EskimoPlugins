import { setSettings } from '../../lib/settings'
import {
	NumberCard,
	NumberRow,
	seconds,
	secondsOff,
} from '../components/NumberRow'
import { useSettings } from '../hooks'
import { openSheet, SHEET } from '../sheet'
import type { ToastDurationMode } from '../../types'

const MODES: ReadonlyArray<{
	value: ToastDurationMode
	label: string
	subLabel: string
}> = [
	{
		value: 'toast',
		label: 'Follow each toast',
		subLabel: 'Uses the duration passed to show()',
	},
	{
		value: 'default',
		label: 'Use the default',
		subLabel: 'Every toast lasts this long',
	},
	{
		value: 'override',
		label: 'Force one duration',
		subLabel: 'Ignores what the toast asked for',
	},
]

export function openTimingSheet(): void {
	openSheet(SHEET.timing, TimingSheet)
}

function TimingSheet() {
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		TableRadioGroup,
		TableRadioRow,
	} = valenced.discord.design.Design as any
	const s = useSettings()
	const set = setSettings

	return (
		<ActionSheet enableContentPanningGesture={false}>
			<BottomSheetTitleHeader title="Timing" />
			<TableRadioGroup
				value={s.durationMode}
				onChange={(mode: ToastDurationMode) => set({ durationMode: mode })}
			>
				{MODES.map(mode => (
					<TableRadioRow
						key={mode.value}
						label={mode.label}
						subLabel={mode.subLabel}
						value={mode.value}
					/>
				))}
			</TableRadioGroup>
			<NumberCard>
				<NumberRow
					label="Default duration"
					value={s.defaultDurationMs}
					minimum={0}
					maximum={15000}
					step={100}
					display={seconds}
					onChange={v => set({ defaultDurationMs: v })}
				/>
				{s.durationMode === 'override' && (
					<NumberRow
						label="Forced duration"
						value={s.overrideDurationMs}
						minimum={0}
						maximum={60000}
						step={100}
						display={seconds}
						onChange={v => set({ overrideDurationMs: v })}
					/>
				)}
				<NumberRow
					label="Minimum duration"
					value={s.minDurationMs}
					minimum={0}
					maximum={60000}
					step={100}
					display={secondsOff}
					onChange={v => set({ minDurationMs: v })}
				/>
				<NumberRow
					label="Maximum duration"
					value={s.maxDurationMs}
					minimum={0}
					maximum={60000}
					step={100}
					display={secondsOff}
					onChange={v => set({ maxDurationMs: v })}
				/>
				<NumberRow
					label="Toasts on screen at once"
					value={s.maxVisible}
					minimum={0}
					maximum={10}
					display={v => (v === 0 ? 'Unlimited' : `${v}`)}
					onChange={v => set({ maxVisible: v })}
				/>
			</NumberCard>
		</ActionSheet>
	)
}
