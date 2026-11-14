/**
 * The frame of the plugin sheet and the place sheet: Discord's action sheet with a title bar and a scrolling body.
 *
 * Inside a bottom sheet a plain scroll view can lose its touches to the sheet, so a long sheet shows a scroll bar and does
 * not move. Two things fix it, the same way Discord's own tall sheets and Server Info's sheets do: the sheet opens expanded
 * in its scrollable mode, and the body is scrolled by the sheet library's own scroll view (gorhom's
 * `BottomSheetScrollView`). The plain scroll view is used only if that one cannot be found or cannot be drawn.
 */

import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { BottomSheet } from '@valenced/externals/gorhom'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { Component, createElement } from 'react'
import { ScrollView, View } from 'react-native'
import { diag } from './diag'
import type { ComponentType, ReactNode } from 'react'

/** What a scroll view is given. */
type ScrollProps = Record<string, unknown>

/** The scroll view chosen for the sheets, once found. */
let scrollPick: ComponentType<ScrollProps> | undefined

/** What was picked, for the debug report. */
let scrollName = 'not picked yet'

/** Which scroll view the sheets use, for the debug report. */
export function sheetScrollName(): string {
	return scrollName
}

/** The sheet library's scroll view, found in the library, on the design components or in a module of its own. */
function findSheetScroll(): ComponentType<ScrollProps> | undefined {
	const viaLibrary = (
		BottomSheet as unknown as
			| { BottomSheetScrollView?: ComponentType<ScrollProps> }
			| undefined
	)?.BottomSheetScrollView
	if (viaLibrary) {
		scrollName = 'BottomSheetScrollView (library)'
		return viaLibrary
	}
	const components = Design as unknown as Record<
		string,
		ComponentType<ScrollProps> | undefined
	>
	const viaDesign =
		components.BottomSheetScrollView || components.ActionSheetScrollView
	if (viaDesign) {
		scrollName = 'BottomSheetScrollView (design)'
		return viaDesign
	}
	const module = lookupModule(
		(withProps as (...names: string[]) => ReturnType<typeof withProps>)(
			'BottomSheetScrollView',
		),
	)[0] as { BottomSheetScrollView?: ComponentType<ScrollProps> } | undefined
	if (module?.BottomSheetScrollView) {
		scrollName = 'BottomSheetScrollView (module)'
		return module.BottomSheetScrollView
	}
	return undefined
}

/** The scroll view for a sheet. */
function sheetScroll(): ComponentType<ScrollProps> {
	if (scrollPick) return scrollPick
	let pick = ScrollView as unknown as ComponentType<ScrollProps>
	scrollName = 'plain ScrollView (the sheet library had none)'
	try {
		const found = findSheetScroll()
		if (found) pick = found
	} catch (error) {
		diag.fail('sheet', error)
	}
	scrollPick = pick
	diag.log('sheet', `scroll view: ${scrollName}`)
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
	componentDidCatch(error: unknown) {
		scrollName = 'plain ScrollView (the library one failed to draw)'
		diag.fail('sheet', error)
	}
	render() {
		return this.state.bad ? this.props.fallback : this.props.children
	}
}

/** The scroll view of a sheet, with the plain one in its place if the sheet's own cannot be drawn. */
function scrollView(props: ScrollProps, children: ReactNode): ReactNode {
	const Scroll = sheetScroll()
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

/** The names Discord's X icon has had. */
const CLOSE_ICONS = ['XSmallIcon', 'CloseIcon', 'XIcon'] as const

/** The asset id of Discord's own X icon, or undefined when Discord has none by the names tried. */
function closeIcon(): number | undefined {
	for (const name of CLOSE_ICONS) {
		const id = getAssetIdByName(name)
		if (id != null) return id
	}
	return undefined
}

/**
 * The sheet opens expanded, in its scrollable mode, so the list inside it is the only thing that scrolls: the sheet no
 * longer takes the drag from it. The sheet adds no padding of its own.
 */
const SHEET_PROPS = {
	scrollable: true,
	startExpanded: true,
	contentStyles: { paddingHorizontal: 0, paddingBottom: 0 },
} as unknown as Record<string, never>

/**
 * The frame of a sheet.
 *
 * @param title The title in the middle of the top bar.
 * @param onClose What the X at the end of the top bar does.
 */
export function SheetFrame({
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
					closeIcon() != null ? (
						<Design.IconButton
							icon={closeIcon() as number}
							variant="tertiary"
							size="sm"
							accessibilityLabel={CLOSE_LABEL}
							onPress={onClose}
						/>
					) : (
						<Design.Button
							text={CLOSE_LABEL}
							variant="tertiary"
							size="sm"
							onPress={onClose}
						/>
					)
				}
			/>
			{scrollView(
				{
					style: { flex: 1 },
					keyboardShouldPersistTaps: 'handled',
					nestedScrollEnabled: true,
					showsVerticalScrollIndicator: true,
				},
				<View style={{ padding: 16, paddingBottom: 140, gap: 14 }}>
					{children}
				</View>,
			)}
		</Design.ActionSheet>
	)
}
