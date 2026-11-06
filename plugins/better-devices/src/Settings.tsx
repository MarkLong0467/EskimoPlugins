import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { KmmiioFooter } from '../../../shared/kmmiio/Footer'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { diag } from './diag'

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Better session control for Settings → Devices: pick several devices and log them out at once, get a warning when a new device signs in, and read clearer details for each device. Nothing here needs setting up.'

/** The settings screen: what the plugin does, who made it and the debugging tools. */
export default function Settings() {
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<KmmiioFooter diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
