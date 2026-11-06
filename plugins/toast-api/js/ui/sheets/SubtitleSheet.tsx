import { setSettings } from '../../lib/settings'
import { LivePreview, SAMPLE_SUBTITLE } from '../components/LivePreview'
import { VariantPicker } from '../components/VariantPicker'
import { useSettings } from '../hooks'
import { openSheet, SHEET } from '../sheet'

export function openSubtitleSheet(): void {
	openSheet(SHEET.subtitle, SubtitleSheet)
}

function SubtitleSheet() {
	const { ActionSheet, BottomSheetTitleHeader, TableRowGroup, TableSwitchRow } =
		valenced.discord.design.Design as any
	const s = useSettings()

	const previewStyle = s.fontFamily ? { fontFamily: s.fontFamily } : undefined

	return (
		<ActionSheet enableContentPanningGesture={false}>
			<BottomSheetTitleHeader title="Subtitle" />
			<LivePreview subtitle={SAMPLE_SUBTITLE} />
			<TableRowGroup>
				<TableSwitchRow
					label="Show subtitle"
					subLabel="Second line, for toasts that carry one"
					value={s.showSubtitle}
					onValueChange={(v: boolean) => setSettings({ showSubtitle: v })}
				/>
			</TableRowGroup>
			{s.showSubtitle && (
				<VariantPicker
					value={s.subtitleVariant}
					sample={SAMPLE_SUBTITLE}
					previewStyle={previewStyle}
					description="Every variant Discord's Text component defines, read live from the design system — never a list this plugin keeps."
					onPick={variant => setSettings({ subtitleVariant: variant })}
				/>
			)}
		</ActionSheet>
	)
}
