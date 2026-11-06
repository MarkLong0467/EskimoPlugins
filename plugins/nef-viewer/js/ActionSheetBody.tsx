import { Design } from '@valenced/discord/design'
import { BottomSheet } from '@valenced/externals/gorhom'
import { Component, createElement } from 'react'
import { ScrollView, useWindowDimensions } from 'react-native'
import { findByProps } from './discord'
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

/**
 * The frame of both sheets: Discord's action sheet with a scrolling stack inside it. The scrolling part is at most
 * three quarters of the screen tall, and it can be scrolled with the sheet's own scrolling, so a long sheet can be read to
 * the end and pulled fully open.
 */
export default function ActionSheetBody({
	children,
}: {
	children?: ReactNode
}) {
	const { height } = useWindowDimensions()
	return (
		<Design.ActionSheet>
			{scrollView(
				{
					style: { maxHeight: Math.round(height * 0.75) },
					keyboardShouldPersistTaps: 'handled',
					nestedScrollEnabled: true,
					showsVerticalScrollIndicator: true,
				},
				<Design.Stack spacing={16} style={{ padding: 16 }}>
					{children}
				</Design.Stack>,
			)}
		</Design.ActionSheet>
	)
}
