import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { KmmiioFooter } from '../../../../shared/kmmiio/Footer'
import { IntroCard } from '../../../../shared/kmmiio/Intro'
import { diag } from '../diag'
import { openOptionsSheet } from './OptionsSheet'

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Material theming for Discord. The colours, the wallpaper option and the rest are in the theme sheet, which also opens from the button in the app theme header.'

/** The settings screen: a way into the theme sheet, who made the plugin and the debugging tools. */
export default function Settings() {
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<Design.TableRowGroup title="Theme">
					<Design.TableRow
						label="Open the theme sheet"
						subLabel="Seed colour, wallpaper colours, tint and more"
						arrow
						onPress={openOptionsSheet}
					/>
				</Design.TableRowGroup>
				<KmmiioFooter diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
