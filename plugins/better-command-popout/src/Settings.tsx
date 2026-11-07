import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { diag } from './diag'
import { state } from './state'

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Tap a slash command in a message and Discord opens its popout. This plugin adds two rows at the top of it: one copies the command’s mention, the other its ID. There is nothing to set: turn the plugin on or off.'
const PREVIEW_TITLE = 'WHAT YOU GET'
const PREVIEW_NOTE = 'Both rows are added at the top of the command popout.'
const MENTION_EXAMPLE = '</command:1234567890>'

/** One step of the way from "Discord opened the popout" to "the rows are there". */
interface Step {
	label: string
	detail: string
	state: 'done' | 'waiting' | 'failed'
}

/** The glyph for a step. */
const glyph = (s: Step['state']): string =>
	s === 'done' ? '✓' : s === 'failed' ? '✗' : '○'

/** The steps, from the counts. A step that is not reached yet waits; a step that was tried and did not work failed. */
function steps(): Step[] {
	const opened = state.opened > 0
	return [
		{
			label: 'Watching Discord’s sheets',
			detail: state.hooked
				? 'The hook on opening sheets is on.'
				: 'The hook could not be installed. Copy the logs below.',
			state: state.hooked ? 'done' : 'failed',
		},
		{
			label: 'Command popout opened',
			detail: opened
				? `Seen ${state.opened} time(s) since Discord started.`
				: 'Tap a slash command in a message to open one.',
			state: opened ? 'done' : 'waiting',
		},
		{
			label: 'Rows container found',
			detail:
				state.containerMissing > 0
					? 'Discord’s popout changed and the container could not be found. Copy the logs below.'
					: state.containerFound > 0
						? 'CommandActionsContainer was found.'
						: 'Waiting for a popout to be drawn.',
			state:
				state.containerMissing > 0
					? 'failed'
					: state.containerFound > 0
						? 'done'
						: 'waiting',
		},
		{
			label: 'Copy rows added',
			detail:
				state.rowsMissing > 0
					? 'The list of rows could not be found. Copy the logs below.'
					: state.added > 0
						? `Added ${state.added} time(s).`
						: 'Waiting for a popout to be drawn.',
			state:
				state.rowsMissing > 0 ? 'failed' : state.added > 0 ? 'done' : 'waiting',
		},
	]
}

/** One line that says how it is going, and what to do if it is not going well. */
function headline(list: Step[]): { label: string; detail: string } {
	if (list.some(s => s.state === 'failed'))
		return {
			label: 'Something is not working',
			detail:
				'Discord may have changed the popout. Press Copy logs below and send the report.',
		}
	if (state.added > 0)
		return {
			label: 'Working',
			detail: 'The copy rows were added to the command popout.',
		}
	return {
		label: 'Ready',
		detail: 'Tap a slash command in a message to see the new rows.',
	}
}

/** The settings screen: what the plugin does, how it is going, what the rows look like, and the debugging tools. */
export default function Settings() {
	const [, redraw] = useState(0)
	useEffect(() => diag.subscribe(() => redraw(n => n + 1)), [])

	const list = steps()
	const status = headline(list)
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
						label="Copies"
						subLabel={`${state.copied} copied since Discord started (${state.mentionPressed} mention, ${state.idPressed} ID)`}
					/>
				</Design.TableRowGroup>
				<View style={{ marginHorizontal: 16 }}>
					<Design.Stack spacing={8}>
						<Design.Text variant="text-xs/bold" color="text-muted">
							{PREVIEW_TITLE}
						</Design.Text>
						<Design.TableRowGroup>
							<Design.TableRow
								label="Copy Command Mention"
								subLabel={`Copies ${MENTION_EXAMPLE}, which becomes a clickable command in a message`}
							/>
							<Design.TableRow
								label="Copy Command ID"
								subLabel="Copies the command’s ID"
							/>
						</Design.TableRowGroup>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{PREVIEW_NOTE}
						</Design.Text>
					</Design.Stack>
				</View>
				<Design.TableRowGroup
					title="How it is going"
					description="Each step turns to a tick when Discord has done it once. A step that fails says what to do."
				>
					{list.map(step => (
						<Design.TableRow
							key={step.label}
							label={`${glyph(step.state)} ${step.label}`}
							subLabel={step.detail}
						/>
					))}
				</Design.TableRowGroup>
				<Design.TableRowGroup title="How it works">
					<Design.TableRow
						label="The mention"
						subLabel="The copied text is the command’s name and ID in Discord’s mention form. Paste it in a message and it shows as a command."
					/>
					<Design.TableRow
						label="Nothing to set"
						subLabel="Turn the plugin off and the rows go away. They appear the next time a popout opens."
					/>
				</Design.TableRowGroup>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
