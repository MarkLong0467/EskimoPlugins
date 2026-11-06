import { openDms } from '../lib/actions'
import { kmmiio } from '../lib/kmmiio'
import { getFluxStore, getME, lazy, useFluxStore } from '../lib/modules'
import MentionBadge from './MentionBadge'

const { Pressable, View, Image, StyleSheet, Animated } =
	valenced.react.ReactNative

const ICON = 48
const ChatIcon = lazy(() => {
	try {
		return valenced.assets.getAssetIdByName('ChatIcon')
	} catch {
		return undefined
	}
})

function useDmTileColors() {
	const selectedGuildId = useFluxStore(
		'SelectedGuildStore',
		store => store?.getGuildId?.(),
		undefined,
	)
	const selected = selectedGuildId == null || selectedGuildId === getME()

	const resolveColor = kmmiio()?.resolveColor
	const bg = selected
		? resolveColor?.('BACKGROUND_BRAND')
		: resolveColor?.('MOBILE_GUILDBAR_ICON_BACKGROUND_DEFAULT')
	const tint = selected
		? resolveColor?.('WHITE')
		: resolveColor?.('MOBILE_GUILDBAR_ICON_DEFAULT')

	return { selected, bg, tint }
}

function useDmMentionCount(): number {
	return useFluxStore(
		'PrivateChannelReadStateStore',
		store => {
			const ids = store?.getUnreadPrivateChannelIds?.() ?? []
			if (ids.length === 0) return 0
			const readState = getFluxStore('ReadStateStore')
			let total = 0
			for (const id of ids) {
				total += readState?.getMentionCount?.(id) ?? 0
			}
			return total
		},
		0,
	)
}

function usePressScale(): [any, (pressed: boolean) => void] {
	const React = valenced.react.React
	const scale = React.useRef(
		new valenced.react.ReactNative.Animated.Value(1),
	).current
	const [pressed, setPressed] = React.useState(false)
	React.useEffect(() => {
		Animated.spring(scale, {
			toValue: pressed ? 0.8 : 1,
			useNativeDriver: true,
			damping: 14,
			stiffness: 220,
		}).start()
	}, [pressed])
	return [scale, setPressed]
}

export default function DmTile({ onPress }: { onPress?: () => void }) {
	const { bg, tint } = useDmTileColors()
	const dmCount = useDmMentionCount()
	const [scale, setPressed] = usePressScale()

	return (
		<Pressable
			onPress={onPress ?? openDms}
			onPressIn={() => setPressed(true)}
			onPressOut={() => setPressed(false)}
			style={st.outer}
		>
			<Animated.View
				style={[st.icon, { backgroundColor: bg, transform: [{ scale }] }]}
			>
				{ChatIcon() != null && (
					<Image
						source={ChatIcon()}
						style={{ width: 24, height: 24, tintColor: tint }}
					/>
				)}
			</Animated.View>
			<MentionBadge count={dmCount} />
		</Pressable>
	)
}

export function RailDmTile() {
	const { tint } = useDmTileColors()
	const dmCount = useDmMentionCount()
	const [scale, setPressed] = usePressScale()

	return (
		<Pressable
			onPress={openDms}
			onPressIn={() => setPressed(true)}
			onPressOut={() => setPressed(false)}
			style={railSt.outer}
		>
			<View style={railSt.iconWrap} collapsable={false}>
				<Animated.View style={[railSt.icon, { transform: [{ scale }] }]}>
					{ChatIcon() != null && (
						<Image
							source={ChatIcon()}
							style={{ width: 24, height: 24, tintColor: tint }}
						/>
					)}
				</Animated.View>
				<MentionBadge count={dmCount} />
			</View>
		</Pressable>
	)
}

const st = StyleSheet.create({
	outer: { width: ICON, height: ICON },
	icon: {
		width: ICON,
		height: ICON,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
})

const railSt = StyleSheet.create({
	outer: {
		flex: 1,
		width: '100%',
		alignItems: 'center',
		justifyContent: 'center',
	},
	iconWrap: { width: ICON, height: ICON },
	icon: {
		width: ICON,
		height: ICON,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
})
