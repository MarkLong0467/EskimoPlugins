import { Design } from '@valenced/discord/design'
import { View } from 'react-native'

/**
 * A short card at the top of a settings screen that says what the plugin does.
 *
 * @param text What to say. Passed as a prop because React Native text must be rendered from an expression.
 */
export function IntroCard({ text }: { text: string }) {
	return (
		<View style={{ marginHorizontal: 16 }}>
			<Design.Card>
				<Design.Text variant="text-md/medium">{text}</Design.Text>
			</Design.Card>
		</View>
	)
}
