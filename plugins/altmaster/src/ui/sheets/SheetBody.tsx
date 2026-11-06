import { getDesign, getRN, getScrollContainer } from './helpers'

export function SheetBody({
	title,
	subtitle,
	children,
}: {
	title?: string
	subtitle?: string
	children?: any
}) {
	const design = getDesign()
	const RN = getRN()
	const { ActionSheet, BottomSheetTitleHeader } = design ?? {}
	const { View, ScrollView } = RN ?? {}
	if (!ActionSheet || !View) return null
	const ScrollContainer = getScrollContainer() ?? ScrollView
	if (!ScrollContainer) return null
	const sideInset = design?.space?.PX_16 ?? 16
	return (
		<ActionSheet
			scrollable
			handleDisabled
			contentStyles={{ paddingHorizontal: 0, paddingBottom: 0 }}
			header={
				BottomSheetTitleHeader ? (
					<View style={{ paddingTop: 12 }}>
						<BottomSheetTitleHeader title={title} subtitle={subtitle} />
					</View>
				) : undefined
			}
		>
			<ScrollContainer
				contentContainerStyle={{
					flexGrow: 1,
					paddingBottom: 24,
					paddingHorizontal: 0,
					gap: 16,
				}}
				nestedScrollEnabled={true}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<View
					style={{
						marginHorizontal: -sideInset,
						paddingHorizontal: sideInset,
						gap: 16,
						paddingTop: 20,
					}}
				>
					{children}
				</View>
			</ScrollContainer>
		</ActionSheet>
	)
}
