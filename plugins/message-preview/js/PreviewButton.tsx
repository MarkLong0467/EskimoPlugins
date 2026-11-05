import { getAssetIdByName } from '@valenced/assets'
import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { before } from '@valenced/patcher'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useEffect, useState } from 'react'
import { Image, Pressable, TouchableOpacity, View } from 'react-native'
import { BUTTON_SIZE } from './constants'
import { openPreview } from './preview'
import type { InputProps } from './types'

/** The styles are made the first time the button is drawn (they need Discord's color tokens), then kept. */
let styles: (() => Record<string, object>) | undefined

/** The button's styles: a round button, in a row that sits over the top left of the message box. */
function getStyles() {
	if (!styles) {
		const colors = (
			Tokens as unknown as { default: { colors: Record<string, string> } }
		).default.colors
		styles = Design.createStyles({
			wrap: {
				flexDirection: 'row',
				position: 'absolute',
				left: 0,
				top: -BUTTON_SIZE,
				zIndex: 3,
			},
			button: {
				borderRadius: 2147483647,
				height: BUTTON_SIZE,
				width: BUTTON_SIZE,
				marginHorizontal: 4,
				marginLeft: 8,
				marginTop: -4,
				flexShrink: 0,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: colors.BACKGROUND_SURFACE_HIGH,
			},
		}) as unknown as typeof styles
	}
	return styles?.() as { wrap: object; button: object }
}

/** What the button needs: the message box's props, whose `handleTextChanged` is called with every change of the text. */
interface Props {
	inputProps: InputProps
}

/**
 * The floating "preview" button over the message box. It is invisible and cannot be tapped until something has been
 * typed. To know what was typed it wraps the box's `handleTextChanged` (and takes the wrapper off when it goes away).
 */
export default function PreviewButton({ inputProps }: Props) {
	const [text, setText] = useState('')

	useEffect(() => {
		const undo = before(
			inputProps as { handleTextChanged: (text: string) => unknown },
			'handleTextChanged',
			(args: unknown[]) => {
				setText(typeof args[0] === 'string' ? args[0] : '')
				return args as [string]
			},
		)
		return () => {
			undo()
		}
	}, [])

	const style = getStyles()
	const visible = text.length > 0
	const Icon = lookupGeneratedIconComponent('EyeIcon') as unknown as
		| React.ComponentType<{ size: string }>
		| undefined
	const asset = getAssetIdByName('EyeIcon')
	const Tap = (Pressable || TouchableOpacity) as typeof Pressable

	return (
		<View
			style={[style.wrap, { opacity: visible ? 1 : 0 }]}
			pointerEvents={visible ? 'box-none' : 'none'}
		>
			<Tap
				style={style.button}
				accessibilityLabel="Preview message"
				onPress={visible ? () => openPreview(text) : undefined}
			>
				{Icon ? (
					<Icon size="md" />
				) : asset != null ? (
					<Image
						source={asset}
						style={{ width: BUTTON_SIZE * 0.6, height: BUTTON_SIZE * 0.6 }}
					/>
				) : null}
			</Tap>
		</View>
	)
}
