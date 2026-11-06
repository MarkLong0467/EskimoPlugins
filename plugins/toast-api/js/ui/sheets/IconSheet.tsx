import { getIconComponent } from '../../lib/icons'
import { setSettings } from '../../lib/settings'
import { resolveColor } from '../../lib/tokens'
import { LivePreview } from '../components/LivePreview'
import { PreviewRow } from '../components/PreviewRow'
import { useSettings } from '../hooks'
import { openSheet, SHEET } from '../sheet'
import type { ToastIconSide } from '../../types'

const ICON_SIZES = [16, 20, 24, 32] as const

const SIDES: ReadonlyArray<{ value: ToastIconSide; subLabel: string }> = [
	{ value: 'left', subLabel: 'Before the text — the legacy default' },
	{ value: 'right', subLabel: 'After the text' },
]

export function openIconSheet(): void {
	openSheet(SHEET.icon, IconSheet)
}

function IconSheet() {
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		TableRadioGroup,
		TableRadioRow,
		TableRowGroup,
		TableSwitchRow,
		Text,
	} = valenced.discord.design.Design as any
	const { View } = valenced.react.ReactNative
	const s = useSettings()

	const Check = getIconComponent('CircleCheckIcon')
	const tint = resolveColor('ICON_FEEDBACK_POSITIVE')

	return (
		<ActionSheet>
			<BottomSheetTitleHeader title="Icon" />
			<LivePreview variant="success" />
			<TableRowGroup
				title="Size"
				description="Each row draws its icon at the size it applies."
			>
				{ICON_SIZES.map(size => (
					<PreviewRow
						key={size}
						selected={s.iconSize === size}
						subLabel={`${size} px`}
						onPress={() => setSettings({ iconSize: size })}
					>
						<View
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								gap: 8,
							}}
						>
							{Check ? (
								<Check color={tint} style={{ width: size, height: size }} />
							) : null}
							<Text variant={s.textVariant}>Saved to your library</Text>
						</View>
					</PreviewRow>
				))}
			</TableRowGroup>

			<TableRadioGroup<ToastIconSide>
				title="Side"
				description="Which side of the text the icon sits on."
				value={s.iconSide}
				onChange={(iconSide: ToastIconSide) => setSettings({ iconSide })}
			>
				{SIDES.map(side => (
					<TableRadioRow
						key={side.value}
						value={side.value}
						label={side.value === 'left' ? 'Left' : 'Right'}
						subLabel={side.subLabel}
					/>
				))}
			</TableRadioGroup>

			<TableRowGroup title="Second icon">
				<TableSwitchRow
					label="Show a second icon"
					subLabel="Gives the toast's own icon one side and the variant's glyph the other"
					value={s.showSecondIcon}
					onValueChange={(value: boolean) =>
						setSettings({ showSecondIcon: value })
					}
				/>
			</TableRowGroup>
		</ActionSheet>
	)
}
