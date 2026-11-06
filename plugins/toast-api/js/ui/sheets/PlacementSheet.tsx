import { setSettings } from '../../lib/settings'
import { useSettings } from '../hooks'
import { closeSheet, openSheet, SHEET } from '../sheet'
import type { ToastPosition } from '../../types'

export function openPlacementSheet(): void {
	openSheet(SHEET.placement, PlacementSheet)
}

function PlacementSheet() {
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		TableRadioGroup,
		TableRadioRow,
		Text,
	} = valenced.discord.design.Design as any
	const s = useSettings()

	return (
		<ActionSheet>
			<BottomSheetTitleHeader title="Placement" />
			<TableRadioGroup<ToastPosition>
				value={s.position}
				onChange={(position: ToastPosition) => {
					// A single choice with nothing to iterate on, so it closes on pick —
					// the same way server-drawer's sheet behaves.
					setSettings({ position })
					closeSheet(SHEET.placement)
				}}
			>
				<TableRadioRow
					value="top"
					label="Top"
					subLabel="Below the status bar, where Discord puts its own"
				/>
				<TableRadioRow
					value="bottom"
					label="Bottom"
					subLabel="Above the tab bar and quest dock"
				/>
			</TableRadioGroup>
			<Text variant="text-sm/medium" color="text-muted">
				A toast can also pass its own position to show() to override this.
			</Text>
		</ActionSheet>
	)
}
