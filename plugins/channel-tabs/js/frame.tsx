/**
 * The frame around Discord's channel screen. Discord draws a channel (its header, the messages and the message box) with one
 * component, `StandaloneChannelScreen`, that is given the channel's id. A hook before each of its elements swaps it for
 * `TabsFrame`, which draws the bar of tabs and then the screen itself, handed the same props. For a split screen it draws the
 * same component a second time with the other channel's id. Nothing of Discord is replaced, and the hook is taken off when the
 * plugin stops.
 */

import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { getModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import { Component, useEffect, useState } from 'react'
import { Design } from '@valenced/discord/design'
import { Pressable, View } from 'react-native'
import { store } from './config'
import { diag } from './diag'
import { labelOf, loadMessages, tabFor } from './discord'
import { countOf, note } from './state'
import TabBar, { SplitDivider } from './TabBar'
import { endSplit, selectTab } from './tabs'
import type { ComponentType, ReactNode } from 'react'
import type { Tab } from './config'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** Where Discord's chat (the messages and the message box under a channel's header) is defined. */
const CHAT_PATH = 'modules/chat/native/ChatView.tsx'

/** Where Discord's channel screen is defined. */
const SCREEN_PATH =
	'modules/main_tabs_v2/native/channel/StandaloneChannelScreen.tsx'

/** Added to the props of the screens this plugin draws, so its own hook leaves them alone. */
const MARK = '__channelTabs'

/** The props Discord gives its channel screen, as far as this plugin reads them. */
type ScreenProps = Record<string, unknown> & {
	channelId?: string
	guildId?: string | null
	screenIndex?: unknown
}

/**
 * The screen index of the second half of a split. Discord keeps what belongs to a chat (its message box, the keyboard that is
 * open for it, the height of its box) under the index of the screen it is on, so two chats with one index take each other's
 * keyboard away. The second half gets the index Discord itself uses when it shows a second chat beside the first (in
 * `ChannelSecondaryViewChatNavigator`), which every part of Discord that reads the index knows.
 */
const SPLIT_INDEX = 'channel-secondary-view-chat'

/** A size as text, for the report. */
const sizeText = (layout: { width?: number; height?: number } | undefined) =>
	`${Math.round(layout?.width ?? -1)}x${Math.round(layout?.height ?? -1)}`

/** Draws again whenever a setting of this plugin is saved. */
function useSettings(): void {
	const [, setTick] = useState(0)
	useEffect(() => store.subscribe(() => setTick(tick => tick + 1)), [])
}

/** The height of the status bar, which the screen's own header leaves room for. */
function useStatusBar(): number {
	try {
		return ReactNativeSafeAreaContext?.useSafeAreaInsets?.()?.top ?? 0
	} catch {
		return 0
	}
}

/**
 * One half of the screen. The header of a channel screen keeps clear of the status bar with padding at its top; when the bar of
 * tabs is above it (it does that itself), the padding is pushed out of the way by moving the screen up behind a clip.
 */
function Pane({
	name,
	clip,
	inset,
	children,
}: {
	/** What the report calls this half. */
	name: string
	clip: boolean
	inset: number
	children: React.ReactNode
}) {
	return (
		<View
			style={{ flex: 1, overflow: 'hidden' }}
			onLayout={(event: {
				nativeEvent?: { layout?: { width?: number; height?: number } }
			}) =>
				note(
					name,
					`${sizeText(event?.nativeEvent?.layout)}, status bar ${Math.round(inset)}${clip ? ' (clipped)' : ''}`,
				)
			}
		>
			<View style={{ flex: 1, marginTop: clip ? -inset : 0 }}>{children}</View>
		</View>
	)
}

/** The second half when it does not draw the chat: the channel that is there, to tap and open. */
function SplitStub({ tab, current }: { tab: Tab; current: Tab }) {
	const label = labelOf(tab)
	return (
		<Pressable
			accessibilityLabel={`Open ${label}`}
			onPress={() => selectTab(tab, current)}
			style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}
		>
			<Design.Text variant="text-md/semibold" color="text-default">
				{label}
			</Design.Text>
			<Design.Text variant="text-sm/medium" color="text-muted">
				Tap to open
			</Design.Text>
		</Pressable>
	)
}

/** What `TabsFrame` is given: the screen that was meant to be drawn, and its props. */
interface FrameProps {
	screen: ComponentType<ScreenProps>
	screenProps: ScreenProps
}

/** The tab bar and the screen, or the two screens of a split. */
function TabsFrame({ screen: Screen, screenProps }: FrameProps) {
	useSettings()
	const inset = useStatusBar()
	const channelId = screenProps.channelId
	const position = store.get('position')
	const layout = store.get('layout')
	const split = store.get('split')
	const second = split && split.id !== channelId ? split : null
	const chat = store.get('splitChat')
	// Discord loads the messages of the selected channel only: those of the second half are asked for here.
	const secondId = second?.id
	useEffect(() => {
		if (!second || !chat) return
		const loads = countOf('second half loads')
		loads.seen++
		if (loadMessages(second)) loads.changed++
	}, [secondId, chat])
	// A split with the channel that is open on the first half is no split: it ends.
	useEffect(() => {
		if (split && split.id === channelId) endSplit()
	}, [split, channelId])
	// Not a channel (the home of a server, for example): the screen as it was.
	if (typeof channelId !== 'string')
		return <Screen {...screenProps} {...{ [MARK]: true }} />
	countOf('channel screens').changed++
	const current = tabFor(channelId, screenProps.guildId)
	const left = position === 'left'
	const stacked = layout === 'stacked'
	if (second) countOf('split panes').changed++
	return (
		<View style={{ flex: 1, flexDirection: left ? 'row' : 'column' }}>
			<TabBar current={current} vertical={left} inset={inset} />
			<View
				style={{
					flex: 1,
					flexDirection: second && !stacked ? 'row' : 'column',
				}}
			>
				<Pane name="first half" clip={!left} inset={inset}>
					<Screen {...screenProps} {...{ [MARK]: true }} />
				</Pane>
				{second ? (
					<>
						<SplitDivider stacked={stacked} />
						<Pane
							name="second half"
							clip={chat && (stacked || !left)}
							inset={inset}
						>
							{chat ? (
								<Screen
									{...screenProps}
									key={second.id}
									channelId={second.id}
									guildId={second.guildId}
									screenIndex={SPLIT_INDEX}
									isNavigationScreen={false}
									{...{ [MARK]: true }}
								/>
							) : (
								<SplitStub tab={second} current={current} />
							)}
						</Pane>
					</>
				) : null}
			</View>
		</View>
	)
}

/**
 * Keeps the tabs from ever taking the chat down with them: if drawing the frame throws, the screen is drawn as Discord made
 * it, and the report says what went wrong.
 */
class Guard extends Component<
	FrameProps & { children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch(error: unknown) {
		diag.fail('frame', error)
	}
	render() {
		if (this.state.failed) {
			const { screen: Screen, screenProps } = this.props
			return <Screen {...screenProps} {...{ [MARK]: true }} />
		}
		return this.props.children
	}
}

/** The frame, with the guard around it. */
function GuardedFrame(props: FrameProps) {
	return (
		<Guard {...props}>
			<TabsFrame {...props} />
		</Guard>
	)
}

/**
 * Notes which chats Discord draws, for the report: one line for each channel and screen index, with how often. A half of the
 * screen that has a size but no chat in this list is one Discord did not draw a chat for. Nothing is changed.
 */
function watchChats(cleanup: Cleanup): void {
	const seen: Record<string, number> = {}
	let found = false
	cleanup(
		diag.apply('frame: chat (watched only)', () =>
			getModuleWithImportedPath<{ default?: unknown }>(CHAT_PATH, module => {
				const chat = module?.default
				if (chat == null || found) return
				found = true
				cleanup(
					beforeJSX(chat as never, args => {
						try {
							const props = args[1] as ScreenProps & { isActive?: unknown }
							const key = `${String(props?.channelId)} @ ${String(props?.screenIndex)}${props?.isActive === false ? ' (inactive)' : ''}`
							seen[key] = (seen[key] ?? 0) + 1
							note(
								'chats drawn',
								Object.entries(seen)
									.slice(-6)
									.map(([name, times]) => `${name} x${times}`)
									.join('; '),
							)
						} catch {
							// Only a note for the report.
						}
						return args
					}),
				)
			}),
		),
	)
}

/** Puts the frame around Discord's channel screen. */
export function installFrame(cleanup: Cleanup): void {
	// Both lines are in the report and the settings even when nothing is found, as 0 of 0.
	countOf('channel screens')
	countOf('split panes')
	watchChats(cleanup)
	let found = false
	cleanup(
		diag.apply('frame: channel screen', () =>
			getModuleWithImportedPath<{ default?: unknown }>(SCREEN_PATH, module => {
				const screen = module?.default
				if (screen == null || found) return
				found = true
				cleanup(
					beforeJSX(screen as never, args => {
						const [, props, key] = args
						const given = props as ScreenProps
						if (given[MARK]) return args
						countOf('channel screens').seen++
						return [
							GuardedFrame,
							{ screen, screenProps: given },
							key,
						] as never
					}),
				)
			}),
		),
	)
}
