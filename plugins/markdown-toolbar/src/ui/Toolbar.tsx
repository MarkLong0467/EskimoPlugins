import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { FORMAT_ACTIONS } from '../lib/actions'
import { color, num, theme } from '../lib/tokens'
import FormatButton from './FormatButton'
import type { FormatAction } from '../lib/actions'

let _chatInputRef: React.RefObject<any> | null = null
const _listeners = new Set<(v: boolean) => void>()
let _keyboardVisible = false

export function setChatInputRef(ref: React.RefObject<any> | null) {
	_chatInputRef = ref
}

export function setKeyboardVisible(visible: boolean) {
	_keyboardVisible = visible
	for (const fn of _listeners) fn(visible)
}

function handleFormat(action: FormatAction) {
	const ref = _chatInputRef?.current
	if (!ref) return
	const [before, after] = action.syntax
	ref.insertText?.(before + after)
	ref.focus?.()
}

export default function MarkdownToolbar() {
	const [visible, setVisible] = useState(_keyboardVisible)
	// The toolbar stays drawn while it animates out, so it is mounted for a little longer than it is visible.
	const [mounted, setMounted] = useState(_keyboardVisible)
	// 0 is hidden, 1 is shown.
	const progress = useRef(new Animated.Value(0)).current

	useEffect(() => {
		_listeners.add(setVisible)
		return () => {
			_listeners.delete(setVisible)
		}
	}, [])

	// Pops up when the keyboard opens and drops away when it closes, instead of just appearing.
	useEffect(() => {
		if (visible) {
			setMounted(true)
			Animated.spring(progress, {
				toValue: 1,
				friction: 7,
				tension: 110,
				useNativeDriver: true,
			}).start()
		} else {
			Animated.timing(progress, {
				toValue: 0,
				duration: 140,
				useNativeDriver: true,
			}).start(({ finished }) => {
				if (finished) setMounted(false)
			})
		}
	}, [visible, progress])

	const onPress = useCallback((action: FormatAction) => {
		handleFormat(action)
	}, [])

	if (!mounted) return null

	const background =
		color.ACCESSORY_BACKGROUND ?? (theme.isLight ? '#FFFFFF' : '#161718')
	const border =
		color.ACCESSORY_BORDER ?? (theme.isLight ? '#D1D5DB' : '#2B2D31')

	return (
		<Animated.View
			style={{
				paddingHorizontal: num.CHAT_INPUT_HORIZONTAL_PADDING,
				paddingBottom: 4,
				// Opacity stops at 1 while the spring overshoots, so the toolbar pops a little past its size and settles.
				opacity: progress.interpolate({
					inputRange: [0, 1],
					outputRange: [0, 1],
					extrapolate: 'clamp',
				}),
				transform: [
					{
						translateY: progress.interpolate({
							inputRange: [0, 1],
							outputRange: [14, 0],
						}),
					},
					{
						scale: progress.interpolate({
							inputRange: [0, 1],
							outputRange: [0.92, 1],
						}),
					},
				],
			}}
		>
			<View
				style={{
					backgroundColor: background,
					borderColor: border,
					borderWidth: StyleSheet.hairlineWidth,
					borderRadius: 12,
					paddingHorizontal: num.CHAT_INPUT_CONTEXT_BAR_PADDING_HORIZONTAL,
					paddingVertical: num.CHAT_INPUT_CONTEXT_BAR_PADDING_VERTICAL,
					flexDirection: 'row',
					alignItems: 'center',
					overflow: 'hidden',
				}}
			>
				{FORMAT_ACTIONS.map(action => (
					<FormatButton key={action.id} action={action} onPress={onPress} />
				))}
			</View>
		</Animated.View>
	)
}
