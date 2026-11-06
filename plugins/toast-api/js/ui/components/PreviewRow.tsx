import { resolveColor } from '../../lib/tokens'
import type { ReactNode } from 'react'

function Check() {
	const { Image } = valenced.react.ReactNative
	let source: number | undefined
	try {
		source = valenced.assets.getAssetIdByName('CheckmarkLargeIcon')
	} catch {
		source = undefined
	}
	if (source == null) return null
	return (
		<Image
			source={source}
			style={{
				width: 20,
				height: 20,
				tintColor: resolveColor('ICON_FEEDBACK_POSITIVE'),
			}}
		/>
	)
}

/**
 * A `TableRow` whose label is arbitrary React instead of a string, so a row can show
 * a live rendering of a font, size or icon rather than naming it. Selection is marked
 * with a check, since `TableRadioRow` can only take text labels.
 */
export function PreviewRow({
	selected,
	subLabel,
	onPress,
	disabled,
	children,
}: {
	selected?: boolean
	subLabel?: ReactNode
	onPress?: () => void
	disabled?: boolean
	children: ReactNode
}) {
	const { View } = valenced.react.ReactNative
	const { TableRow } = valenced.discord.design.Design

	return (
		<TableRow
			label={
				(<View style={{ flex: 1, paddingVertical: 4 }}>{children}</View>) as any
			}
			subLabel={subLabel}
			trailing={selected ? <Check /> : undefined}
			disabled={disabled}
			onPress={onPress}
		/>
	)
}
