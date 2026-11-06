import { ACTIVITY_LABELS } from '../../constants'
import { getSettings, setSettings } from '../../lib/state'
import { ACTION_SHEET_KEY } from '../sheetKeys'
import type { ActivityType } from '../../types'

function ActionSheet() {
	return valenced.discord.actions?.ActionSheetActionCreators
}

function closeSheet() {
	try {
		ActionSheet()?.hideActionSheet?.(ACTION_SHEET_KEY)
	} catch {}
}

export function ActivityTypeSheet() {
	const Design = valenced.discord.design.Design as any
	const {
		ActionSheet: AS,
		BottomSheetTitleHeader,
		TableRadioGroup,
		TableRadioRow,
	} = Design

	const current = getSettings().activityType

	return (
		<AS>
			<BottomSheetTitleHeader title="Activity Status" />
			<TableRadioGroup
				value={current as ActivityType}
				onChange={(value: any) => {
					const v = Number(value)
					if (!ACTIVITY_LABELS[v as ActivityType]) return
					setSettings({ activityType: v as ActivityType })
					closeSheet()
				}}
			>
				{Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
					<TableRadioRow
						key={value}
						value={Number(value) as ActivityType}
						label={label}
					/>
				))}
			</TableRadioGroup>
		</AS>
	)
}

export function openActivityTypePicker() {
	try {
		ActionSheet()?.openLazy?.(
			Promise.resolve({ default: ActivityTypeSheet }),
			ACTION_SHEET_KEY,
			{ sheetKey: ACTION_SHEET_KEY } as any,
		)
	} catch {}
}
