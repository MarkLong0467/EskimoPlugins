import { setSettings } from '../../lib/settings'
import { LivePreview } from '../components/LivePreview'
import { NumberCard, NumberRow } from '../components/NumberRow'
import { useSettings } from '../hooks'
import { openSheet, SHEET } from '../sheet'

export function openLayoutSheet(): void {
	openSheet(SHEET.layout, LayoutSheet)
}

function LayoutSheet() {
	const { ActionSheet, BottomSheetTitleHeader, TableRowGroup, TableSwitchRow } =
		valenced.discord.design.Design as any
	const s = useSettings()
	const set = setSettings

	return (
		<ActionSheet enableContentPanningGesture={false}>
			<BottomSheetTitleHeader title="Layout" />
			<LivePreview />
			<NumberCard>
				<NumberRow
					label="Corner radius"
					value={s.radius}
					minimum={0}
					maximum={32}
					onChange={v => set({ radius: v })}
				/>
				<NumberRow
					label="Gap between toasts"
					value={s.gap}
					minimum={0}
					maximum={32}
					onChange={v => set({ gap: v })}
				/>
				<NumberRow
					label="Padding (top / bottom)"
					value={s.paddingY}
					minimum={0}
					maximum={32}
					onChange={v => set({ paddingY: v })}
				/>
				<NumberRow
					label="Padding (left / right)"
					value={s.paddingX}
					minimum={0}
					maximum={32}
					onChange={v => set({ paddingX: v })}
				/>
				<NumberRow
					label="Border width"
					value={s.borderWidth}
					minimum={0}
					maximum={4}
					step={0.5}
					display={v => (v === 0 ? 'None' : `${v} px`)}
					onChange={v => set({ borderWidth: v })}
				/>
				<NumberRow
					label="Maximum width"
					value={s.maxWidth}
					minimum={0}
					maximum={480}
					step={10}
					display={v => (v === 0 ? 'Screen − 32' : `${v} px`)}
					onChange={v => set({ maxWidth: v })}
				/>
			</NumberCard>
			<TableRowGroup>
				<TableSwitchRow
					label="Drop shadow"
					subLabel="The elevation Discord puts behind its own toasts"
					value={s.shadow}
					onValueChange={(v: boolean) => set({ shadow: v })}
				/>
			</TableRowGroup>
		</ActionSheet>
	)
}
