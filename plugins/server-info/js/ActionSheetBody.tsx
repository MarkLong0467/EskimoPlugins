import { Design } from '@valenced/discord/design'
import { BottomSheet } from '@valenced/externals/gorhom'
import { Component, createElement } from 'react'
import { Pressable, ScrollView } from 'react-native'
import { findByProps } from './discord'
import { Glyph } from './parts'
import type { ComponentType, ReactNode } from 'react'

/** What a scroll view is given. */
type ScrollProps = Record<string, unknown>

/** The sheet library's scroll view, or nothing if the library is not there. */
function gorhomScroll(): ComponentType<ScrollProps> | undefined {
	try {
		return (
			BottomSheet as unknown as
				| { BottomSheetScrollView?: ComponentType<ScrollProps> }
				| undefined
		)?.BottomSheetScrollView
	} catch {
		return undefined
	}
}

/** The scroll view chosen for the sheets, once found. */
let scrollPick: ComponentType<ScrollProps> | undefined

/**
 * The scrolling part of a sheet.
 *
 * Inside a bottom sheet a plain scroll view can lose its touches to the sheet, so the sheet can neither be scrolled nor
 * pulled open. The sheet library (gorhom's bottom sheet) has its own scroll view for that: it is used when it can be found
 * (in the library itself, on the design components, or in a module of its own), and the plain one otherwise.
 */
function sheetScrollComponent(): ComponentType<ScrollProps> {
	if (scrollPick) return scrollPick
	let pick = ScrollView as unknown as ComponentType<ScrollProps>
	try {
		const components = Design as unknown as Record<
			string,
			ComponentType<ScrollProps> | undefined
		>
		const found =
			gorhomScroll() ||
			components.BottomSheetScrollView ||
			components.ActionSheetScrollView ||
			findByProps<{ BottomSheetScrollView?: ComponentType<ScrollProps> }>(
				'BottomSheetScrollView',
			)?.BottomSheetScrollView
		if (found) pick = found
	} catch {
		// The plain scroll view is used.
	}
	scrollPick = pick
	return pick
}

/** Draws its children, or the fallback if drawing them throws. */
class Boundary extends Component<
	{ fallback: ReactNode; children?: ReactNode },
	{ bad: boolean }
> {
	state = { bad: false }
	static getDerivedStateFromError() {
		return { bad: true }
	}
	render() {
		return this.state.bad ? this.props.fallback : this.props.children
	}
}

/** The scroll view of a sheet: the sheet's own, and the plain one in its place if the sheet's own cannot be drawn. */
function scrollView(props: ScrollProps, children: ReactNode): ReactNode {
	const Scroll = sheetScrollComponent()
	const plain = createElement(
		ScrollView as unknown as ComponentType<ScrollProps>,
		props,
		children,
	)
	if (Scroll === (ScrollView as unknown)) return plain
	return createElement(
		Boundary,
		{ fallback: plain },
		createElement(Scroll, props, children),
	)
}

/** The word on the close button for screen readers. */
const CLOSE_LABEL = 'Close'

/**
 * The sheet opens expanded, in its scrollable mode (the setup Discord's own tall sheets use). Then the list inside it is the
 * only thing that scrolls: the sheet no longer takes the drag from it, which is what made a long sheet show a scroll bar and
 * not move. The sheet adds no padding of its own, so the cards can run the whole width.
 */
const SHEET_PROPS = {
	scrollable: true,
	startExpanded: true,
	contentStyles: { paddingHorizontal: 0, paddingBottom: 0 },
} as unknown as Record<string, never>

/**
 * The frame of both sheets: Discord's action sheet with a title and a close button on top, and a scrolling stack under them.
 * The scrolling part fills the room under the title, with the sheet's own scroll view, so a long sheet can be read to the end.
 *
 * @param title The title in the middle of the top bar.
 * @param onClose What the X at the end of the top bar does.
 */
export default function ActionSheetBody({
	title,
	onClose,
	children,
}: {
	title: string
	onClose: () => void
	children?: ReactNode
}) {
	return (
		<Design.ActionSheet {...SHEET_PROPS}>
			<Design.BottomSheetTitleHeader
				title={title}
				trailing={
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={CLOSE_LABEL}
						hitSlop={12}
						onPress={onClose}
						style={{ padding: 6 }}
					>
						<Glyph names={['XSmallIcon', 'CloseIcon', 'XIcon']} fallback="✕" />
					</Pressable>
				}
			/>
			{scrollView(
				{
					style: { flex: 1 },
					keyboardShouldPersistTaps: 'handled',
					nestedScrollEnabled: true,
					showsVerticalScrollIndicator: true,
				},
				<Design.Stack spacing={16} style={{ padding: 16, paddingBottom: 140 }}>
					{children}
				</Design.Stack>,
			)}
		</Design.ActionSheet>
	)
}
