import { listTextVariantGroups } from '../../lib/typography'
import { PreviewRow } from './PreviewRow'

export function VariantPicker({
	value,
	sample,
	previewStyle,
	onPick,
	description,
}: {
	value: string
	sample: string
	previewStyle?: any
	onPick: (variant: string) => void
	description?: string
}) {
	const { TableRowGroup, Text } = valenced.discord.design.Design as any
	const groups = listTextVariantGroups()
	if (groups.length === 0) return null

	return (
		<>
			{groups.map((group, index) => (
				<TableRowGroup
					key={group.family}
					title={group.label}
					description={index === 0 ? description : undefined}
				>
					{group.variants.map(variant => (
						<PreviewRow
							key={variant}
							selected={value === variant}
							subLabel={variant}
							onPress={() => onPick(variant)}
						>
							<Text variant={variant} style={previewStyle}>
								{sample}
							</Text>
						</PreviewRow>
					))}
				</TableRowGroup>
			))}
		</>
	)
}
