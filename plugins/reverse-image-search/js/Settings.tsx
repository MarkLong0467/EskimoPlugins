import { ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { diag } from './diag'

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Adds ImageSearch to image context menus. Hold a picture in chat, or open it and tap the menu of the viewer, then Search Image: Google, Yandex, SauceNAO, IQDB, Bing, TinEye, ImgOps, or All of them.'

/** The settings screen: what the plugin does, and its logs. Equicord has no settings for it either. */
export default function Settings() {
	return (
		<ScrollView>
			<View style={{ paddingVertical: 20, gap: 22 }}>
				<IntroCard text={INTRO} />
				<DebugSection diag={diag} />
			</View>
		</ScrollView>
	)
}
