import { Pressable } from 'react-native'
import { num } from '../lib/tokens'
import type { FormatAction } from '../lib/actions'

interface Props {
	action: FormatAction
	onPress: (action: FormatAction) => void
}

export default function FormatButton({ action, onPress }: Props) {
	const { Text } = valenced.discord.design.Design
	const pad = num.CHAT_INPUT_PILL_PADDING
	return (
		<Pressable
			onPress={() => {
				onPress(action)
			}}
			accessibilityRole="button"
			accessibilityLabel={action.label}
			style={({ pressed }) => ({
				flex: 1,
				alignItems: 'center' as const,
				justifyContent: 'center' as const,
				paddingVertical: pad,
				opacity: pressed ? 0.6 : 1,
			})}
		>
			<Text
				variant="text-md/semibold"
				color="text-muted"
				style={{
					...(action.fontWeight
						? { fontWeight: action.fontWeight as any }
						: {}),
					...(action.fontStyle ? { fontStyle: action.fontStyle as any } : {}),
					...(action.textDecoration && action.textDecoration !== 'none'
						? { textDecorationLine: action.textDecoration as any }
						: {}),
				}}
			>
				{action.label}
			</Text>
		</Pressable>
	)
}
