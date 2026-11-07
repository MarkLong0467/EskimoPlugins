import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { hasDiscordClear, probe } from './clear'
import { diag } from './diag'
import { state } from './state'

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Discord shows a "Suggested" section at the top of a server’s channel list, and it comes back even after you remove it. This plugin keeps it away. There is nothing to set: turn the plugin on or off. You may need to switch to another server and back for it to take effect.'

/** One line that says how it is going, and what to do if it is not going well. */
function headline(): { label: string; detail: string } {
	const patched = state.replaced > 0 || state.patched > 0
	if (!patched)
		return {
			label: 'Waiting for a server',
			detail: 'Open any server. The section is found when Discord draws it.',
		}
	if (state.stuck > 0)
		return {
			label: 'The header is hidden, but channels come back',
			detail:
				'Discord drew the suggested channels again after they were cleared. Press Copy logs below and send the report.',
		}
	if (state.cleared === 0)
		return {
			label: 'Working',
			detail:
				'The section is being kept away. There were no suggested channels to clear yet.',
		}
	return {
		label: 'Working',
		detail: 'The section is hidden and its channels are cleared.',
	}
}

/** The way suggestions were cleared, in words. */
function method(): string {
	if (state.clearedByDiscord > 0)
		return `Discord’s own clear option (${state.how || 'found'})`
	if (state.clearedByParts > 0)
		return 'Discord’s clear steps, one by one (its own function was not found)'
	if (state.clearedByEvent > 0)
		return 'The clear event alone (Discord’s function was not found, so some rows may stay)'
	return hasDiscordClear()
		? 'Discord’s own clear option is ready'
		: 'Nothing cleared yet'
}

/** The settings screen: what the plugin does, how it is going, a check, how it works, and the debugging tools. */
export default function Settings() {
	const [, redraw] = useState(0)
	useEffect(() => diag.subscribe(() => redraw(n => n + 1)), [])
	const [checked, setChecked] = useState('')

	const status = headline()
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<Design.TableRowGroup title="Status">
					<Design.TableRow label={status.label} subLabel={status.detail} />
					<Design.TableRow
						label="Suggestions cleared"
						subLabel={`${state.cleared} time(s) since Discord started, ${state.channelsCleared} channel(s) in all`}
					/>
					<Design.TableRow label="Cleared with" subLabel={method()} />
				</Design.TableRowGroup>
				<Design.TableRowGroup
					title="Check"
					description={
						checked ||
						'Looks for Discord’s own clear function and its parts right now.'
					}
				>
					<Design.TableRow
						label="Check Discord now"
						subLabel="Tap to see what the plugin can find in this version of Discord"
						onPress={() =>
							setChecked(
								Object.entries(probe())
									.map(([name, value]) => `${name}: ${value}`)
									.join('\n'),
							)
						}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="How it works">
					<Design.TableRow
						label="The header"
						subLabel="Discord draws the section's title with one component. The plugin replaces it with nothing."
					/>
					<Design.TableRow
						label="The channels"
						subLabel="The rows are channels that are new, unread, mention you or were visited lately. The plugin clears them the way Discord’s own Clear option does: it saves that you dismissed them and marks them read."
					/>
					<Design.TableRow
						label="Nothing to set"
						subLabel="Turn the plugin off and the section comes back. Switch servers if it does not change at once."
					/>
				</Design.TableRowGroup>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
