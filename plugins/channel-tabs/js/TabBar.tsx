import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Pressable, ScrollView, View } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import { store } from './config'
import { labelOf } from './discord'
import {
	addCurrent,
	isSaved,
	removeAll,
	removeTab,
	selectTab,
	splitButton,
	toggleSplit,
} from './tabs'
import type { Tab } from './config'

/** The size of the bar's buttons. */
const SIZE = 30
/** The width of the bar when it is on the left. */
const SIDE_WIDTH = 132
/** How thick the strip with the handle is. */
const HANDLE = 14
/** The height of the row of tabs when the bar is on top: the buttons and the room above them. */
const ROW_HEIGHT = SIZE + 6
/** How long the bar takes to slide in or out, in milliseconds. */
const SLIDE_MS = 190
/** How far a finger has to move on the handle for it to count as a pull, not a tap. */
const PULL = 6

/** The styles are made the first time the bar is drawn (they need Discord's colour tokens), then kept. */
let styles: (() => Record<string, object>) | undefined

/**
 * The bar's styles. Every colour is one of Discord's tokens, so a theme that recolours Discord recolours the bar with it. The
 * bar has the background of the channel header under it, and the chips are see-through layers over that, which keeps them
 * right on any theme.
 */
function getStyles(): Record<string, object> {
	if (!styles) {
		const colors = (
			Tokens as unknown as { default: { colors: Record<string, string> } }
		).default.colors
		styles = Design.createStyles({
			bar: {
				backgroundColor:
					colors.STANDALONE_CHANNEL_CONTENT_BACKGROUND ??
					colors.BACKGROUND_BASE_LOW,
				borderColor:
					colors.STANDALONE_CHANNEL_HEADER_BORDER ?? colors.BORDER_SUBTLE,
				flexShrink: 0,
			},
			chip: {
				flexDirection: 'row',
				alignItems: 'center',
				height: SIZE,
				borderRadius: SIZE / 2,
				borderWidth: 1,
				borderColor: colors.BORDER_SUBTLE,
				backgroundColor: colors.BACKGROUND_MOD_SUBTLE,
				paddingLeft: 12,
			},
			chipActive: {
				backgroundColor: colors.BACKGROUND_BRAND,
				borderColor: colors.BACKGROUND_BRAND,
			},
			chipSplit: {
				borderColor: colors.BACKGROUND_BRAND,
				borderWidth: 1.5,
			},
			controls: {
				alignItems: 'center',
				borderRadius: SIZE / 2,
				borderWidth: 1,
				borderColor: colors.BORDER_SUBTLE,
				backgroundColor: colors.BACKGROUND_MOD_SUBTLE,
				overflow: 'hidden',
			},
			button: {
				alignItems: 'center',
				justifyContent: 'center',
				height: SIZE - 2,
				minWidth: SIZE - 2,
				paddingHorizontal: 9,
			},
			buttonOn: {
				backgroundColor: colors.BACKGROUND_BRAND,
			},
			rule: {
				backgroundColor: colors.BORDER_SUBTLE,
			},
			grip: {
				backgroundColor: colors.TEXT_MUTED ?? colors.BORDER_STRONG,
				borderRadius: 2,
			},
			divider: {
				backgroundColor: colors.BACKGROUND_BRAND,
			},
		}) as unknown as typeof styles
	}
	return (styles as () => Record<string, object>)()
}

/** The line between the two halves of a split screen, in the theme's accent colour. */
export function SplitDivider({ stacked }: { stacked: boolean }) {
	const s = getStyles()
	return (
		<View
			style={[
				s.divider,
				stacked ? { height: 2 } : { width: 2 },
				{ opacity: 0.7 },
			]}
		/>
	)
}

/** Where a touch is, as far as the handle reads it. */
type Touch = { nativeEvent?: { pageX?: number; pageY?: number } }

/**
 * The handle that folds the bar away and pulls it back out: a short line under the bar (beside it when the bar is on the
 * left). Pull it away from the edge of the screen to open the bar, push it back to close it, or just tap it.
 */
function Handle({
	vertical,
	collapsed,
}: {
	vertical: boolean
	collapsed: boolean
}) {
	const s = getStyles()
	const from = useRef<number | null>(null)
	const at = (event: Touch): number | null => {
		const point = vertical ? event?.nativeEvent?.pageX : event?.nativeEvent?.pageY
		return typeof point === 'number' ? point : null
	}
	const toggle = () => store.set({ collapsed: !collapsed })
	return (
		<View
			accessible
			accessibilityRole="button"
			accessibilityLabel={collapsed ? 'Show the tabs' : 'Hide the tabs'}
			onAccessibilityTap={toggle}
			hitSlop={{ top: 6, bottom: 10, left: 10, right: 10 }}
			style={{
				alignItems: 'center',
				justifyContent: 'center',
				width: vertical ? HANDLE : undefined,
				height: vertical ? undefined : HANDLE,
				alignSelf: 'stretch',
			}}
			onTouchStart={(event: Touch) => {
				from.current = at(event)
			}}
			onTouchEnd={(event: Touch) => {
				const start = from.current
				const end = at(event)
				from.current = null
				const moved = start == null || end == null ? 0 : end - start
				if (moved > PULL) store.set({ collapsed: false })
				else if (moved < -PULL) store.set({ collapsed: true })
				else toggle()
			}}
		>
			<View
				style={[
					s.grip,
					vertical ? { width: 4, height: 36 } : { width: 36, height: 4 },
					{ opacity: collapsed ? 0.9 : 0.5 },
				]}
			/>
		</View>
	)
}

/** What the bar needs. */
export interface TabBarProps {
	/** The channel that is open on the first half of the screen. */
	current: Tab
	/** Whether the bar is a column on the left, not a row on top. */
	vertical: boolean
	/** The height of the status bar, which a bar on top or on the left has to stay clear of. */
	inset: number
}

/** One tab: its name (tap to open it, hold to split with it) and the ✕ that closes it. The open tab is filled with the accent colour. */
function TabChip({
	tab,
	current,
	vertical,
}: {
	tab: Tab
	current: Tab
	vertical: boolean
}) {
	const s = getStyles()
	const open = tab.id === current.id
	const split = store.get('split')?.id === tab.id
	const label = labelOf(tab)
	return (
		<View
			style={[
				s.chip,
				vertical ? null : { maxWidth: 200 },
				split && s.chipSplit,
				open && s.chipActive,
			]}
			accessibilityRole="tab"
			accessibilityState={{ selected: open }}
		>
			<Pressable
				accessibilityLabel={`Tab: ${label}`}
				style={{ flexShrink: 1, justifyContent: 'center', height: SIZE }}
				onPress={() => selectTab(tab, current)}
				onLongPress={() => toggleSplit(tab, current.id)}
			>
				<Design.Text
					variant={open ? 'text-sm/semibold' : 'text-sm/medium'}
					color={open ? 'text-overlay-light' : 'text-default'}
					lineClamp={1}
				>
					{label}
				</Design.Text>
			</Pressable>
			<Pressable
				accessibilityLabel={`Close tab: ${label}`}
				hitSlop={6}
				style={{
					width: SIZE - 2,
					height: SIZE,
					alignItems: 'center',
					justifyContent: 'center',
					opacity: open ? 0.85 : 1,
				}}
				onPress={() => removeTab(tab.id)}
			>
				<Design.Text
					variant="text-xs/semibold"
					color={open ? 'text-overlay-light' : 'text-muted'}
				>
					✕
				</Design.Text>
			</Pressable>
		</View>
	)
}

/** Runs a function on the next frame of the screen. What it returns stops it. */
function nextFrame(run: () => void): () => void {
	if (typeof requestAnimationFrame === 'function') {
		const frame = requestAnimationFrame(run)
		return () => cancelAnimationFrame(frame)
	}
	const timer = setTimeout(run, 16)
	return () => clearTimeout(timer)
}

/**
 * The slide of the bar: a number that goes from 0 (folded away) to 1 (open) over a few frames whenever the bar is opened or
 * closed, fast at first and slower at the end. The bar is drawn again for each frame with that number, so what is on the
 * screen is always what React drew, and the slide cannot leave the bar in a state that the settings do not say.
 */
function useSlide(collapsed: boolean): number {
	const [value, setValue] = useState(collapsed ? 0 : 1)
	const at = useRef(value)
	useEffect(() => {
		const target = collapsed ? 0 : 1
		const start = at.current
		if (start === target) return
		const began = Date.now()
		let stop = () => {}
		const step = () => {
			const time = Math.min(1, (Date.now() - began) / SLIDE_MS)
			const next = start + (target - start) * (1 - (1 - time) ** 3)
			at.current = next
			setValue(next)
			if (time < 1) stop = nextFrame(step)
		}
		stop = nextFrame(step)
		return () => stop()
	}, [collapsed])
	return value
}

/**
 * The window the tabs slide through: it grows from nothing to the size of the tabs, which keep their own size and are held to
 * the far edge, so they come out from under the edge of the screen instead of being squeezed.
 */
function Slide({
	value,
	vertical,
	children,
}: {
	value: number
	vertical: boolean
	children: React.ReactNode
}) {
	const size = (vertical ? SIDE_WIDTH : ROW_HEIGHT) * value
	return (
		<View
			style={[
				{ overflow: 'hidden', opacity: value },
				vertical
					? { width: size, alignItems: 'flex-end' }
					: { height: size, justifyContent: 'flex-end' },
			]}
		>
			{children}
		</View>
	)
}

/**
 * The bar of tabs: one chip for each saved channel (tap to open it, hold to put it in the second half of a split screen, the
 * ✕ to close it), and at the end one group of buttons: save the open channel, split the screen, close every tab.
 */
export default function TabBar({ current, vertical, inset }: TabBarProps) {
	const s = getStyles()
	const tabs = store.get('tabs')
	const split = store.get('split')
	const saved = isSaved(current.id)
	const collapsed = store.get('collapsed')
	const slide = useSlide(collapsed)
	// While the bar slides out its tabs are still drawn. Folded away, only the handle is left.
	const shown = !collapsed || slide > 0
	// The line between two buttons of the group.
	const rule = (
		<View
			style={[s.rule, vertical ? { height: 1, width: '60%' } : { width: 1, height: 14 }]}
		/>
	)
	const controls = (
		<View
			style={[
				s.controls,
				{ flexDirection: vertical ? 'column' : 'row' },
				vertical ? { alignSelf: 'stretch' } : null,
			]}
		>
			<Pressable
				accessibilityLabel="Save this channel as a tab"
				style={[
					s.button,
					vertical ? { alignSelf: 'stretch' } : null,
					saved && { opacity: 0.35 },
				]}
				onPress={() => addCurrent(current)}
			>
				<Design.Text variant="text-md/semibold" color="text-default">
					＋
				</Design.Text>
			</Pressable>
			{tabs.length > 0 ? (
				<>
					{split ? null : rule}
					<Pressable
						accessibilityLabel="Split the screen"
						style={[
							s.button,
							vertical ? { alignSelf: 'stretch' } : null,
							split && s.buttonOn,
						]}
						onPress={() => splitButton(current.id)}
					>
						<Design.Text
							variant="text-sm/medium"
							color={split ? 'text-overlay-light' : 'text-default'}
						>
							{split ? 'Unsplit' : 'Split'}
						</Design.Text>
					</Pressable>
					{split ? null : rule}
					<Pressable
						accessibilityLabel="Close all tabs"
						style={[s.button, vertical ? { alignSelf: 'stretch' } : null]}
						onPress={removeAll}
					>
						<Design.Text variant="text-sm/medium" color="text-muted">
							✕ all
						</Design.Text>
					</Pressable>
				</>
			) : null}
		</View>
	)
	const chips = tabs.map(tab => (
		<TabChip key={tab.id} tab={tab} current={current} vertical={vertical} />
	))
	// With no tabs yet, the bar says what the ＋ is for.
	const hint =
		tabs.length === 0 ? (
			<Design.Text variant="text-xs/medium" color="text-muted" lineClamp={2}>
				{vertical ? 'No tabs yet' : 'Tap ＋ to keep this channel as a tab'}
			</Design.Text>
		) : null
	// Folded away, only the handle is left (and, on top, the room the status bar needs).
	if (vertical) {
		return (
			<View
				style={[
					s.bar,
					{ paddingTop: inset, flexDirection: 'row', borderRightWidth: 1 },
				]}
			>
				{shown ? (
					<Slide value={slide} vertical>
						<View
							style={{
								flex: 1,
								width: SIDE_WIDTH,
								paddingTop: 8,
								paddingLeft: 6,
							}}
						>
							<ScrollView
								style={{ flex: 1 }}
								showsVerticalScrollIndicator={false}
								contentContainerStyle={{ gap: 6, paddingBottom: 6 }}
							>
								{chips}
								{hint}
							</ScrollView>
							<View style={{ paddingVertical: 8 }}>{controls}</View>
						</View>
					</Slide>
				) : null}
				<Handle vertical collapsed={collapsed} />
			</View>
		)
	}
	// On top the bar has no line under it: it and the channel's header, which has the same background, read as one piece.
	return (
		<View style={[s.bar, { paddingTop: inset }]}>
			{shown ? (
				<Slide value={slide} vertical={false}>
					<View
						style={{
							height: ROW_HEIGHT,
							paddingTop: 6,
							flexDirection: 'row',
							alignItems: 'center',
						}}
					>
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							style={{ flex: 1 }}
							contentContainerStyle={{
								gap: 6,
								paddingHorizontal: 10,
								alignItems: 'center',
							}}
						>
							{chips}
							{hint}
						</ScrollView>
						<View style={{ paddingRight: 10, paddingLeft: 4 }}>{controls}</View>
					</View>
				</Slide>
			) : null}
			<Handle vertical={false} collapsed={collapsed} />
		</View>
	)
}
