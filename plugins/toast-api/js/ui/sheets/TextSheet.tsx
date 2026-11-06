import { setSettings } from '../../lib/settings'
import { listFontFamilies } from '../../lib/typography'
import { LivePreview } from '../components/LivePreview'
import { NumberCard, NumberRow } from '../components/NumberRow'
import { PreviewRow } from '../components/PreviewRow'
import { VariantPicker } from '../components/VariantPicker'
import { useSettings } from '../hooks'
import { openSheet, SHEET } from '../sheet'

const SAMPLE = 'The quick brown fox jumps over the lazy dog'

export function openTextSheet(): void {
	openSheet(SHEET.text, TextSheet)
}

function TextSheet() {
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		TableRow,
		TableRowGroup,
		Text,
		TextInput,
	} = valenced.discord.design.Design as any
	const { View } = valenced.react.ReactNative
	const s = useSettings()
	const set = setSettings
	// Read on every render so a font added to the build shows up without a restart.
	const fonts = listFontFamilies()

	// Applied to every preview so what the row shows is what the toast will show.
	const sizeStyle = s.textSize > 0 ? { fontSize: s.textSize } : undefined
	const previewStyle = s.fontFamily
		? { ...sizeStyle, fontFamily: s.fontFamily }
		: sizeStyle

	return (
		<ActionSheet enableContentPanningGesture={false}>
			<BottomSheetTitleHeader title="Text" />
			<LivePreview />

			<VariantPicker
				value={s.textVariant}
				sample="Saved to your library"
				previewStyle={previewStyle}
				description="Every variant Discord's Text component defines, read live from the design system — never a list this plugin keeps. Picking one also clears the custom size below."
				onPick={variant => set({ textVariant: variant, textSize: 0 })}
			/>

			<TableRowGroup
				title="Font family"
				description="Each row renders in the family it applies, so a family that does not resolve here will not resolve on a toast either."
			>
				<TableRow
					label={
						(
							<View style={{ flex: 1, gap: 4, paddingVertical: 4 }}>
								<Text variant="text-md/semibold">Font family</Text>
								<TextInput
									placeholder="Discord default"
									value={s.fontFamily}
									isClearable
									onChange={(v: string) => set({ fontFamily: v })}
								/>
							</View>
						) as any
					}
				/>
				<PreviewRow
					selected={s.fontFamily === ''}
					subLabel="Discord default"
					onPress={() => set({ fontFamily: '' })}
				>
					<Text variant={s.textVariant} style={sizeStyle}>
						{SAMPLE}
					</Text>
				</PreviewRow>
				{fonts.map(family => (
					<PreviewRow
						key={family}
						selected={s.fontFamily === family}
						subLabel={family}
						onPress={() => set({ fontFamily: family })}
					>
						<Text
							variant={s.textVariant}
							style={{ ...sizeStyle, fontFamily: family }}
						>
							{SAMPLE}
						</Text>
					</PreviewRow>
				))}
			</TableRowGroup>

			<NumberCard>
				<NumberRow
					label="Custom font size"
					value={s.textSize}
					minimum={0}
					maximum={32}
					display={v => (v === 0 ? 'From title size' : `${v} px`)}
					onChange={v => set({ textSize: v })}
				/>
				<NumberRow
					label="Lines per toast"
					value={s.lineClamp}
					minimum={1}
					maximum={6}
					onChange={v => set({ lineClamp: v })}
				/>
			</NumberCard>
		</ActionSheet>
	)
}
