import { Text, View } from 'react-native'
import { NSFW_COLOR } from './constants'

/** The small red "NSFW" tag drawn next to the name of an NSFW channel. */
export default function NsfwBadge() {
	return (
		<View
			style={{
				backgroundColor: NSFW_COLOR,
				borderRadius: 4,
				paddingHorizontal: 4,
				paddingVertical: 1,
				marginRight: 6,
				alignSelf: 'center',
			}}
		>
			<Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>
				NSFW
			</Text>
		</View>
	)
}
