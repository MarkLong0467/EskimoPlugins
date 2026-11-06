import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import { createGuild, logStatus, openDms, switchGuild } from '../lib/actions'
import { kmmiio } from '../lib/kmmiio'
import {
	getAssetId,
	getExternalCoordinationContext,
	getGestureContext,
	getQuestDockMode,
	lazy,
	reactive,
	useFluxStore,
	useQuestDockExpanded,
} from '../lib/modules'
import { COLLAPSED_DOCK_HEIGHT } from '../lib/quests'
import DmTile from './DmTile'
import FolderItem from './FolderItem'
import GuildItem from './GuildItem'
import type { Context } from 'react'

const {
	View,
	Pressable,
	Animated,
	ScrollView,
	BackHandler,
	Dimensions,
	StyleSheet,
	Image,
} = valenced.react.ReactNative

const ICON = 48
const GAP = 8
const ROW_GAP = 13
const HIT_SLOP = { top: 4, left: 12, bottom: 4, right: 12 }

const FallbackGestureContext = valenced.react.React.createContext(null)
const FallbackExternalContext = valenced.react.React.createContext(null)

export function CreateJoinButton({ onPress }: { onPress: () => void }) {
	const React = valenced.react.React
	const scale = React.useRef(
		new valenced.react.ReactNative.Animated.Value(1),
	).current
	const scaleDown = React.useCallback(() => {
		Animated.spring(scale, { toValue: 0.9, useNativeDriver: true }).start()
	}, [scale])
	const scaleUp = React.useCallback(() => {
		Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
	}, [scale])

	const resolveColor = kmmiio()?.resolveColor
	const bg = resolveColor?.('MOBILE_GUILDBAR_ICON_BACKGROUND_DEFAULT')
	const tint = resolveColor?.('MOBILE_GUILDBAR_ICON_DEFAULT')
	const PlusAsset = lazy(() => getAssetId('CirclePlusIcon-primary'))

	return (
		<Pressable
			onPress={onPress}
			onPressIn={scaleDown}
			onPressOut={scaleUp}
			hitSlop={HIT_SLOP}
		>
			<Animated.View
				style={[st.createJoin, { backgroundColor: bg, transform: [{ scale }] }]}
			>
				{PlusAsset() != null && (
					<Image
						source={PlusAsset()}
						style={{ width: 24, height: 24, tintColor: tint }}
					/>
				)}
			</Animated.View>
		</Pressable>
	)
}

export default function ServerDrawerSheet({
	gestureContext,
}: {
	gestureContext?: any
}) {
	const React = valenced.react.React
	const insets = ReactNativeSafeAreaContext.useSafeAreaInsets()

	const extCtx = React.useContext(
		(getExternalCoordinationContext()?.QuestDockExternalCoordinationContext ??
			FallbackExternalContext) as Context<any>,
	)
	const setMode = (extCtx as any)?.setRestingQuestDockMode

	const collapseDock = React.useCallback(() => {
		try {
			const { QuestDockMode } = getQuestDockMode() ?? {}
			if (setMode && QuestDockMode?.COLLAPSED != null)
				setMode(QuestDockMode.COLLAPSED)
		} catch {
			// dock coordination unavailable - navigation still works
		}
	}, [setMode])

	const pick = React.useCallback(
		(id: string) => {
			collapseDock()
			switchGuild(id)
		},
		[collapseDock],
	)

	const nodes = useFluxStore(
		'SortedGuildStore',
		store =>
			(store?.getGuildsTree?.()?.root?.children ?? []).filter(
				(node: any) => node.type !== 'root',
			),
		[],
	)

	const gestureCtx = (gestureContext ??
		getGestureContext()) as Context<any> | null
	const ctx = React.useContext(gestureCtx ?? FallbackGestureContext) as any
	const minH = ctx?.minExpandedContentHeight

	const onLayout = React.useCallback(
		(e: any) => {
			if (!minH) return
			const h = e.nativeEvent.layout.height
			if (minH.get() !== h) minH.set(h)
		},
		[minH],
	)

	const openCreateJoin = React.useCallback(() => {
		collapseDock()
		createGuild()
	}, [collapseDock])

	const specs = ctx?.questDockWrapperSpecs

	React.useEffect(() => {
		const { QuestDockMode } = getQuestDockMode() ?? {}
		if (!setMode || !QuestDockMode || !specs) return
		const sub = BackHandler.addEventListener('hardwareBackPress', () => {
			const h = specs.get()?.height ?? 56
			if (h > 80) {
				setMode(QuestDockMode.COLLAPSED)
				return true
			}
			return false
		})
		return () => sub.remove()
	}, [setMode, specs])

	const { width: winW } = Dimensions.get('window')

	// Measure the slot width exactly once and freeze it. The card is narrower
	// than the window (e.g. 328 vs 360) and its width is re-animated on every
	// open/close (snap + dimensionsLayoutTransition), so deriving columns from a
	// live measurement would re-wrap the rows mid-motion: an icon keeps trying
	// to join the first row, then changes its mind, round and round. Fixing the
	// geometry to the first stable measurement makes the rows unable to reflow.
	const [layoutW, setLayoutW] = React.useState(0)
	const firstW = React.useRef(0)
	const onCardLayout = React.useCallback((e: any) => {
		if (firstW.current === 0) {
			const w = e.nativeEvent.layout.width
			if (w > 0) {
				firstW.current = w
				setLayoutW(w)
			}
		}
	}, [])

	// The first layout may fire before the card's animated width is applied
	// (transient/undefined), which would otherwise freeze an absurd col count.
	// The card is never wider than the window in any mode, so clamp to winW.
	const base = Math.max(0, Math.min(layoutW > 0 ? layoutW : winW, winW))
	// 6 icons (6*48 + 5*8 = 328) fill the collapsed card flush edge-to-edge;
	// the ScrollView content container centers the grid, so the same on-screen
	// x holds in collapsed and expanded. Columns stay constant between states
	// so an icon never jumps to another row.
	const cols = Math.max(3, Math.floor((base + GAP) / (ICON + GAP)))
	const totalW = cols * ICON + (cols - 1) * GAP

	React.useEffect(() => {
		if (firstW.current !== 0) {
			console.log(
				'[ServerDrawer] grid geometry: cardW =',
				firstW.current,
				'clamped base =',
				base,
				'cols =',
				cols,
				'totalW =',
				totalW,
			)
		}
	}, [base, cols, totalW])

	const { dmTileMode, showGuildNames } = reactive()

	const isExpanded = useQuestDockExpanded()

	React.useEffect(() => {
		logStatus()
		console.log(
			'[ServerDrawer] dock anchor: isExpanded =',
			isExpanded,
			'layout = single-grid (card height clips)',
		)
	}, [isExpanded])

	// Safety net: keep the collapsed wrapper taller than stock so the first
	// row's icons (and their badges/rings) are not clipped top/bottom and the
	// second row peeks. QuestDockHooks writes QUEST_DOCK_COLLAPSED_HEIGHT on
	// collapse; if it already initialized with the stock value, bump it here.
	React.useEffect(() => {
		if (!specs || isExpanded) return
		const cur = specs.get()?.height
		if (typeof cur === 'number' && cur < COLLAPSED_DOCK_HEIGHT) {
			specs.set({ ...(specs.get() ?? {}), height: COLLAPSED_DOCK_HEIGHT })
			console.log(
				'[ServerDrawer] collapsed dock height override ->',
				COLLAPSED_DOCK_HEIGHT,
				'(was',
				cur,
				')',
			)
		}
	}, [isExpanded, specs])

	const tiles: any[] = []
	if (dmTileMode === 'drawer') {
		tiles.push(
			<DmTile
				key="dm"
				onPress={() => {
					collapseDock()
					openDms()
				}}
			/>,
		)
	}
	for (const node of nodes) {
		tiles.push(
			node.type === 'folder' ? (
				<FolderItem
					key={node.id}
					node={node}
					onPick={pick}
					showNames={!!showGuildNames}
				/>
			) : (
				<GuildItem
					key={node.id}
					node={node}
					onPick={pick}
					showNames={!!showGuildNames}
				/>
			),
		)
	}
	tiles.push(<CreateJoinButton key="create" onPress={openCreateJoin} />)

	return (
		<View style={st.slot} onLayout={onCardLayout}>
			<ScrollView
				style={st.alignTop}
				contentContainerStyle={st.content}
				showsVerticalScrollIndicator={false}
			>
				<View
					style={[
						st.grid,
						{
							width: totalW,
							paddingTop: 12,
							paddingBottom: insets.bottom + 8,
							columnGap: GAP,
							rowGap: ROW_GAP,
						},
					]}
					onLayout={onLayout}
				>
					{tiles}
				</View>
			</ScrollView>
		</View>
	)
}

const st = StyleSheet.create({
	// Single-grid mode: the grid lives only in this (expanded) slot and is
	// always mounted/visible; the collapsed slot renders null. The card is
	// overflow:hidden, so its native height animation clips the top rows in
	// collapse and reveals the rest on open — no crossfade, no row reflow.
	slot: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	alignTop: {
		flex: 1,
		justifyContent: 'flex-start',
		alignItems: 'flex-start',
	},
	content: {
		width: '100%',
		alignItems: 'center',
	},
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		alignContent: 'flex-start',
	},
	createJoin: {
		width: ICON,
		height: ICON,
		borderRadius: 16,
		overflow: 'hidden',
		alignItems: 'center',
		justifyContent: 'center',
	},
})
