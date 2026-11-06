import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
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

	useEffect(() => {
		_listeners.add(setVisible)
		return () => {
			_listeners.delete(setVisible)
		}
	}, [])

	const onPress = useCallback((action: FormatAction) => {
		handleFormat(action)
	}, [])

	if (!visible) return null

	const background =
		color.ACCESSORY_BACKGROUND ?? (theme.isLight ? '#FFFFFF' : '#161718')
	const border =
		color.ACCESSORY_BORDER ?? (theme.isLight ? '#D1D5DB' : '#2B2D31')

	return (
		<View
			style={{
				paddingHorizontal: num.CHAT_INPUT_HORIZONTAL_PADDING,
				paddingBottom: 4,
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
		</View>
	)
}
