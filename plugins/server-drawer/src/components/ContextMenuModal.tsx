import { useCallback, useEffect, useRef, useState } from 'react'
import { kmmiio } from '../lib/kmmiio'
import { haptic } from '../lib/modules'
import type { ContextMenuItem } from '../lib/contextMenu'

const { Animated, Dimensions, Image, Modal, Pressable, StyleSheet, View } =
	valenced.react.ReactNative

const EDGE = 12
const PAD = 12
const ITEM_H = 42
const MIN_W = 220
const DIVIDER_H = 4
const RADIUS = 16
const ICON_SIZE = 20
const ITEM_VPAD = 10
const OFFSET = 10
const MIN_SCALE = 0.5

const SPRING_CONFIG = { tension: 200, friction: 20 }

export type ContextMenuModalProps = {
	visible: boolean
	items: ContextMenuItem[]
	title: string
	anchorX: number
	anchorTopY: number
	anchorH: number
	onClose: () => void
}

export default function ContextMenuModal({
	visible,
	items,
	title,
	anchorX,
	anchorTopY,
	anchorH,
	onClose,
}: ContextMenuModalProps) {
	const { width: winW, height: winH } = Dimensions.get('window')
	const { Text } = valenced.discord.design.Design

	const titleH = title ? PAD + 20 + DIVIDER_H : 0
	const menuH = titleH + items.length * ITEM_H

	let left = anchorX
	const belowY = anchorTopY + anchorH + OFFSET
	let top = belowY
	if (top + menuH > winH - EDGE) top = anchorTopY - menuH - OFFSET
	const openedAbove = top !== belowY
	if (left + MIN_W > winW - EDGE) left = winW - MIN_W - EDGE
	if (left < EDGE) left = EDGE
	if (top < EDGE) top = EDGE

	// Scaling happens about the container's centre, so at progress 0 the menu is
	// inset from where it should be by (1 - MIN_SCALE) * halfSize on each axis.
	// Offsetting by exactly that much pins the top-left corner to the icon and
	// makes the menu grow out of it. MIN_W is used for the width because the
	// width is not known until after layout, same as Discord's own popout.
	const cornerX = -(1 - MIN_SCALE) * (MIN_W / 2)
	const cornerY = (openedAbove ? 1 : -1) * (1 - MIN_SCALE) * (menuH / 2)

	const resolveColor = kmmiio()?.resolveColor
	const bgContainer = resolveColor?.('BACKGROUND_SURFACE_HIGHEST') ?? '#1f2023'
	const borderColor =
		resolveColor?.('BORDER_SUBTLE') ?? 'rgba(255,255,255,0.08)'
	const textColor = resolveColor?.('TEXT_STRONG') ?? '#f2f3f5'
	const pressedColor =
		resolveColor?.('BACKGROUND_MOD_SUBTLE') ?? 'rgba(255,255,255,0.04)'

	const backdropOpacity = useRef(new Animated.Value(0)).current
	const progress = useRef(new Animated.Value(0)).current

	const [show, setShow] = useState(false)
	const closing = useRef(false)

	useEffect(() => {
		if (visible && !closing.current) {
			setShow(true)
			backdropOpacity.setValue(0)
			progress.setValue(0)
			Animated.timing(backdropOpacity, {
				toValue: 1,
				duration: 150,
				useNativeDriver: true,
			}).start()
			Animated.spring(progress, {
				toValue: 1,
				useNativeDriver: true,
				...SPRING_CONFIG,
			}).start()
		}
	}, [visible])

	const handleClose = useCallback(() => {
		if (closing.current) return
		closing.current = true
		Animated.parallel([
			Animated.timing(backdropOpacity, {
				toValue: 0,
				duration: 120,
				useNativeDriver: true,
			}),
			Animated.timing(progress, {
				toValue: 0,
				duration: 120,
				useNativeDriver: true,
			}),
		]).start(() => {
			closing.current = false
			setShow(false)
			onClose()
		})
	}, [onClose])

	if (!show) return null

	return (
		<Modal
			transparent
			visible={show}
			onRequestClose={handleClose}
			statusBarTranslucent
		>
			<Pressable style={styles.root} onPress={handleClose}>
				<Animated.View
					style={[styles.backdrop, { opacity: backdropOpacity }]}
				/>
				<Animated.View
					style={[
						styles.container,
						{
							left,
							top,
							backgroundColor: bgContainer,
							borderColor,
							minWidth: MIN_W,
							opacity: progress,
							transform: [
								{
									translateX: progress.interpolate({
										inputRange: [0, 1],
										outputRange: [cornerX, 0],
									}),
								},
								{
									translateY: progress.interpolate({
										inputRange: [0, 1],
										outputRange: [cornerY, 0],
									}),
								},
								{
									scale: progress.interpolate({
										inputRange: [0, 1],
										outputRange: [MIN_SCALE, 1],
									}),
								},
							],
						},
					]}
				>
					{title ? (
						<View>
							<Text
								variant="text-md/bold"
								color="text-strong"
								style={{
									paddingHorizontal: PAD,
									paddingTop: 13,
									paddingBottom: 12,
								}}
							>
								{title}
							</Text>
							<View
								style={{
									borderBottomWidth: DIVIDER_H,
									borderBottomColor: borderColor,
								}}
							/>
						</View>
					) : null}
					{items.map((item, i) => {
						const isFirst = i === 0 && !title
						const isLast = i === items.length - 1
						const hasIcon = !!(item.iconSource || item.IconComponent)

						return (
							<Pressable
								key={i}
								style={({ pressed }) => ({
									paddingHorizontal: PAD,
									paddingVertical: ITEM_VPAD,
									minHeight: ITEM_H,
									flexDirection: 'row',
									justifyContent: 'space-between',
									alignItems: 'center',
									gap: 8,
									backgroundColor: pressed ? pressedColor : 'transparent',
									borderTopLeftRadius: isFirst ? RADIUS : 0,
									borderTopRightRadius: isFirst ? RADIUS : 0,
									borderBottomLeftRadius: isLast ? RADIUS : 0,
									borderBottomRightRadius: isLast ? RADIUS : 0,
									borderBottomWidth: !isFirst && !isLast ? 1 : 0,
									borderBottomColor: borderColor,
								})}
								onPress={() => {
									try {
										haptic('IMPACT_LIGHT')
									} catch {
										// haptics are best-effort
									}
									handleClose()
									item.action?.()
								}}
							>
								<Text
									variant="text-md/medium"
									color="text-strong"
									style={{ flexShrink: 1 }}
								>
									{item.label}
								</Text>
								{hasIcon ? (
									<View
										style={{
											width: ICON_SIZE,
											height: ICON_SIZE,
											alignItems: 'center',
											justifyContent: 'center',
										}}
									>
										{item.IconComponent ? (
											<item.IconComponent size="sm" color={textColor} />
										) : item.iconSource ? (
											<Image
												source={item.iconSource}
												style={{
													width: ICON_SIZE,
													height: ICON_SIZE,
													tintColor: textColor,
												}}
											/>
										) : null}
									</View>
								) : null}
							</Pressable>
						)
					})}
				</Animated.View>
			</Pressable>
		</Modal>
	)
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
	},
	backdrop: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: 'rgba(0,0,0,0.55)',
	},
	container: {
		position: 'absolute',
		borderWidth: 1,
		borderRadius: RADIUS,
		overflow: 'hidden',
		elevation: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 12 },
		shadowOpacity: 0.24,
		shadowRadius: 24,
	},
})
