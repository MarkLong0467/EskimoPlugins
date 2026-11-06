import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { diag } from './diag'
import { state } from './state'

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Discord shows a "Suggested" section at the top of a server’s channel list, and it comes back even after you remove it. This plugin keeps it away. There is nothing to set: turn the plugin on or off. You may need to switch to another server and back for it to take effect.'
const WORKING = 'The suggested channels section is being kept away.'
const WAITING =
	'Waiting for a server to open. Open any server and the section is patched.'

/** The settings screen: what the plugin does, what it has done and the debugging tools. */
export default function Settings() {
	const [, redraw] = useState(0)
	useEffect(() => diag.subscribe(() => redraw(n => n + 1)), [])

	const patched = state.replaced > 0 || state.patched > 0
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<Design.TableRowGroup title="Status">
					<Design.TableRow
						label={patched ? 'Working' : 'Not patched yet'}
						subLabel={patched ? WORKING : WAITING}
					/>
					<Design.TableRow
						label="Suggestions cleared"
						subLabel={`${state.cleared} time(s) since Discord started, ${state.channelsCleared} channel(s) in all`}
					/>
				</Design.TableRowGroup>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
