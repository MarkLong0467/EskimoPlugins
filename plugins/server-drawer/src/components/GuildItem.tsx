import { openContextMenu } from '../lib/contextMenu'
import { kmmiio } from '../lib/kmmiio'
import { buildGuildMenuItems } from '../lib/menuItems'
import { useFluxStore, useSelectedGuildId } from '../lib/modules'
import GuildIcon from './GuildIcon'
import MentionBadge from './MentionBadge'

const { View, Text, Pressable, Animated, StyleSheet } =
	valenced.react.ReactNative

const ICON = 48

function GuildBadge({ guildId }: { guildId: string }) {
	const mentionCount = useFluxStore(
		'GuildReadStateStore',
		store => store?.getMentionCount?.(guildId) ?? 0,
		0,
	)
	const hasUnread = useFluxStore(
		'GuildReadStateStore',
		store => store?.hasUnread?.(guildId) ?? false,
		false,
	)

	if (mentionCount > 0) {
		return <MentionBadge count={mentionCount} />
	}

	if (hasUnread) {
		return (
			<View style={bd.dotOutline}>
				<View style={bd.dot} />
			</View>
		)
	}

	return null
}

export default function GuildItem({
	node,
	onPick,
	showNames,
	selected,
}: {
	node: any
	onPick: (id: string) => void
	showNames?: boolean
	selected?: boolean
}) {
	const React = valenced.react.React

	const scale = React.useRef(
		new valenced.react.ReactNative.Animated.Value(1),
	).current
	const [pressed, setPressed] = React.useState(false)
	const springTo = React.useCallback(
		(v: number) => {
			Animated.spring(scale, {
				toValue: v,
				useNativeDriver: true,
				damping: 14,
				stiffness: 220,
			}).start()
		},
		[scale],
	)

	React.useEffect(() => {
		springTo(pressed ? 0.85 : 1)
	}, [pressed, springTo])

	const guildId = node.id as string
	const name = useFluxStore(
		'GuildStore',
		store => store?.getGuild?.(guildId)?.name ?? '',
		'',
	)
	const selectedGuildId = useSelectedGuildId()
	const selectedItem = selected ?? selectedGuildId === guildId
	const resolveColor = kmmiio()?.resolveColor
	const labelColor = resolveColor?.('TEXT_DEFAULT')
	const brandColor = resolveColor?.('TEXT_BRAND') ?? '#5865f2'

	const menuRef = React.useRef<any>(null)

	const suppressPick = React.useRef(false)

	const openMenu = React.useCallback(() => {
		const menuItems = buildGuildMenuItems(guildId)
		if (menuItems.length === 0) return
		suppressPick.current = true
		openContextMenu({
			ref: menuRef,
			items: menuItems,
			title: name || guildId,
			onClose: () => {
				suppressPick.current = false
			},
		})
	}, [guildId, name])

	const tile = (buttonProps?: any) => (
		<Pressable
			onPress={() => {
				if (!suppressPick.current) onPick(guildId)
			}}
			onLongPress={openMenu}
			onPressIn={() => {
				suppressPick.current = false
				setPressed(true)
			}}
			onPressOut={() => setPressed(false)}
		>
			<View {...buttonProps} collapsable={false} style={st.outer}>
				<View ref={menuRef} collapsable={false} style={st.iconWrap}>
					<Animated.View style={[st.tile, { transform: [{ scale }] }]}>
						{selectedItem && (
							<View
								pointerEvents="none"
								style={[st.selection, { borderColor: brandColor }]}
							/>
						)}
						<View style={st.icon}>
							<GuildIcon id={guildId} />
						</View>
					</Animated.View>
					<GuildBadge guildId={guildId} />
				</View>
				{showNames && (
					<Text
						numberOfLines={2}
						ellipsizeMode="tail"
						style={[
							st.label,
							{
								color: selectedItem && brandColor ? brandColor : labelColor,
							},
						]}
					>
						{name}
					</Text>
				)}
			</View>
		</Pressable>
	)

	return tile()
}

const st = StyleSheet.create({
	outer: { width: ICON, alignItems: 'center' },
	iconWrap: { width: ICON, height: ICON },
	tile: { width: ICON, height: ICON },
	selection: {
		position: 'absolute',
		top: -5,
		left: -5,
		right: -5,
		bottom: -5,
		borderWidth: 3,
		borderRadius: 20,
	},
	icon: { width: ICON, height: ICON, borderRadius: 16, overflow: 'hidden' },
	label: {
		marginTop: 10,
		width: ICON,
		fontSize: 10,
		lineHeight: 12,
		fontWeight: '600',
		textAlign: 'center',
	},
})

const bd = StyleSheet.create({
	dotOutline: {
		position: 'absolute',
		bottom: -2,
		right: -2,
		width: 14,
		height: 14,
		borderRadius: 7,
		backgroundColor: '#1a1a2e',
		alignItems: 'center',
		justifyContent: 'center',
	},
	dot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: '#ed4245',
	},
})
