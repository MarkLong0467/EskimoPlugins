import { toggleFolder } from '../lib/actions'
import { openContextMenu } from '../lib/contextMenu'
import { kmmiio } from '../lib/kmmiio'
import { buildFolderMenuItems } from '../lib/menuItems'
import { lazy, useFluxStore, useSelectedGuildId } from '../lib/modules'
import GuildIcon from './GuildIcon'
import GuildItem from './GuildItem'
import MentionBadge from './MentionBadge'
import type { ReactNode } from 'react'

const { View, Text, Image, Animated, Pressable, StyleSheet } =
	valenced.react.ReactNative

const ICON = 48
const MINI = 16

const POS = [
	{ top: 6, left: 6 },
	{ top: 6, right: 6 },
	{ bottom: 6, left: 6 },
	{ bottom: 6, right: 6 },
]

const FolderIcon = lazy(() => {
	try {
		return valenced.assets.getAssetIdByName('FolderIcon')
	} catch {
		return undefined
	}
})

function folderColor(color?: number | null): string {
	if (color == null) return '#5865f2'
	return `#${color.toString(16).padStart(6, '0')}`
}

function FolderBadge({ node }: { node: any }) {
	const total = useFluxStore(
		'GuildReadStateStore',
		store => {
			let sum = 0
			for (const child of node.children) {
				sum += store?.getMentionCount?.(child.id) ?? 0
			}
			return sum
		},
		0,
	)

	return <MentionBadge count={total} />
}

function FolderCover({ node }: { node: any }) {
	const col = folderColor(node.color)
	return (
		<View style={fc.outer}>
			<View style={[fc.icon, { backgroundColor: col }]}>
				{node.children.slice(0, 4).map((ch: any, i: number) => (
					<View key={ch.id} style={[fc.cell, POS[i]]}>
						<GuildIcon id={ch.id as string} size={MINI} />
					</View>
				))}
			</View>
			<FolderBadge node={node} />
		</View>
	)
}

const fc = StyleSheet.create({
	outer: { width: ICON, height: ICON },
	icon: { width: ICON, height: ICON, borderRadius: 16, overflow: 'hidden' },
	cell: {
		position: 'absolute',
		width: MINI,
		height: MINI,
		borderRadius: 8,
		overflow: 'hidden',
	},
})

function FadeIn({ children }: { children: ReactNode }) {
	const React = valenced.react.React
	const opacity = React.useRef(
		new valenced.react.ReactNative.Animated.Value(0),
	).current
	React.useEffect(() => {
		Animated.timing(opacity, {
			toValue: 1,
			duration: 180,
			useNativeDriver: true,
		}).start()
	}, [])
	return <Animated.View style={{ opacity }}>{children}</Animated.View>
}

export default function FolderItem({
	node,
	onPick,
	showNames,
}: {
	node: any
	onPick: (id: string) => void
	showNames?: boolean
}) {
	const React = valenced.react.React

	const open = useFluxStore(
		'ExpandedGuildFolderStore',
		store =>
			store?.getExpandedFolders?.() instanceof Set &&
			store.getExpandedFolders().has(node.id),
		false,
	)

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

	React.useEffect(() => {
		springTo(1)
	}, [open, springTo])

	const guildIdToShow = useSelectedGuildId()
	const folderSelected = node.children.some(
		(ch: any) => ch.id === guildIdToShow,
	)
	const labelColor = kmmiio()?.resolveColor?.('TEXT_DEFAULT')
	const brandColor = kmmiio()?.resolveColor?.('TEXT_BRAND')

	const menuRef = React.useRef<any>(null)

	const title =
		typeof node.name === 'string' && node.name.length > 0 ? node.name : 'Folder'

	const suppressPick = React.useRef(false)

	const openMenu = React.useCallback(() => {
		const menuItems = buildFolderMenuItems(node)
		if (menuItems.length === 0) return
		suppressPick.current = true
		openContextMenu({
			ref: menuRef,
			items: menuItems,
			title,
			onClose: () => {
				suppressPick.current = false
			},
		})
	}, [node, title])

	const folderContent = (icon: ReactNode) => (
		<View style={fo.wrap}>
			<View ref={menuRef} collapsable={false}>
				{icon}
			</View>
			{showNames && node.name ? (
				<Text
					numberOfLines={2}
					ellipsizeMode="tail"
					style={[
						fo.label,
						{
							color: folderSelected && brandColor ? brandColor : labelColor,
						},
					]}
				>
					{node.name}
				</Text>
			) : null}
		</View>
	)

	const folderButton = (content: ReactNode, buttonProps?: any) => (
		<Pressable
			onPress={() => {
				if (!suppressPick.current) toggleFolder(node.id as string)
			}}
			onLongPress={openMenu}
			onPressIn={() => {
				suppressPick.current = false
				setPressed(true)
			}}
			onPressOut={() => setPressed(false)}
		>
			<View {...buttonProps} collapsable={false}>
				<Animated.View style={{ transform: [{ scale }] }}>
					{content}
				</Animated.View>
			</View>
		</Pressable>
	)

	const folderMenu = (content: ReactNode) => folderButton(content)

	return (
		<>
			{open ? (
				<>
					{folderMenu(
						folderContent(
							<View
								style={[
									fo.openIcon,
									{ backgroundColor: folderColor(node.color) },
								]}
							>
								{FolderIcon() != null && (
									<Image
										source={FolderIcon()}
										style={fo.folderImg}
										tintColor="#fff"
									/>
								)}
							</View>,
						),
					)}
					{node.children.map((ch: any) => (
						<FadeIn key={ch.id}>
							<GuildItem
								node={ch}
								onPick={onPick}
								showNames={showNames}
								selected={ch.id === guildIdToShow}
							/>
						</FadeIn>
					))}
				</>
			) : (
				folderMenu(
					folderContent(
						<View style={fo.coverWrap} collapsable={false}>
							{folderSelected && (
								<View
									pointerEvents="none"
									style={[fo.selection, { borderColor: brandColor }]}
								/>
							)}
							<FolderCover node={node} />
						</View>,
					),
				)
			)}
		</>
	)
}

const fo = StyleSheet.create({
	wrap: { width: ICON, alignItems: 'center' },
	coverWrap: { width: ICON, height: ICON },
	selection: {
		position: 'absolute',
		top: -5,
		left: -5,
		right: -5,
		bottom: -5,
		borderWidth: 3,
		borderRadius: 20,
	},
	openIcon: {
		width: ICON,
		height: ICON,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
	folderImg: { width: 24, height: 24 },
	label: {
		marginTop: 10,
		width: ICON,
		fontSize: 10,
		lineHeight: 12,
		fontWeight: '600',
		textAlign: 'center',
	},
})
