import { pickSettingColor } from '../../lib/colorPicker'
import { setSettings } from '../../lib/settings'
import { LivePreview } from '../components/LivePreview'
import { useSettings } from '../hooks'
import { openSheet, SHEET } from '../sheet'

const COLOR_ROWS = [
	['textColor', 'Text', 'mobile-text-heading-primary'],
	['backgroundColor', 'Background', 'MOBILE_TOAST_BACKGROUND_DEFAULT'],
	['borderColor', 'Border', 'BORDER_SUBTLE'],
] as const

export function openColoursSheet(): void {
	openSheet(SHEET.colours, ColoursSheet)
}

function ColoursSheet() {
	const { ActionSheet, BottomSheetTitleHeader, TableRow, TableRowGroup } =
		valenced.discord.design.Design as any
	const { View } = valenced.react.ReactNative
	const s = useSettings()

	return (
		<ActionSheet>
			<BottomSheetTitleHeader title="Colours" />
			<LivePreview />
			<TableRowGroup
				title="Overrides"
				description="Leave these empty to keep Discord's own tokens."
			>
				{COLOR_ROWS.map(([key, label, fallback]) => {
					const value = s[key]
					return (
						<TableRow
							key={key}
							label={label}
							subLabel={value || `Default · ${fallback}`}
							arrow
							trailing={
								value ? (
									<View
										style={{
											width: 24,
											height: 24,
											borderRadius: 12,
											backgroundColor: value,
										}}
									/>
								) : undefined
							}
							onPress={() => pickSettingColor(key)}
						/>
					)
				})}
				<TableRow
					label="Reset colour overrides"
					onPress={() =>
						setSettings({
							textColor: '',
							backgroundColor: '',
							borderColor: '',
						})
					}
				/>
			</TableRowGroup>
		</ActionSheet>
	)
}
