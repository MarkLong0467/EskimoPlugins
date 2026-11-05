import { Design } from '@valenced/discord/design'
import { ScrollView, useWindowDimensions } from 'react-native'
import type { ReactNode } from 'react'

/**
 * The frame of both sheets: Discord's action sheet with a scrolling stack inside it. The scrolling part is at most
 * three quarters of the screen tall, so a long sheet can still be scrolled.
 */
export default function ActionSheetBody({
	children,
}: {
	children?: ReactNode
}) {
	const { height } = useWindowDimensions()
	return (
		<Design.ActionSheet>
			<ScrollView style={{ maxHeight: Math.round(height * 0.75) }}>
				<Design.Stack spacing={16} style={{ padding: 16 }}>
					{children}
				</Design.Stack>
			</ScrollView>
		</Design.ActionSheet>
	)
}
