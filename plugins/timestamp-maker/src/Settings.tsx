import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { openToast } from '../../../shared/kmmiio/toast'
import { diag } from './diag'
import { openPopup } from './Popup'
import { state } from './state'
import {
	clearRecents,
	MINUTE_STEPS,
	resetAll,
	setting,
	store,
	update,
} from './store'
import { offsetName, preview, STYLES, tag, zoneName } from './time'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Action, Settings as TimestampSettings } from './store'
import type { Style } from './time'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: TimestampSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Type /timestamp in any chat to open a popup that builds a Discord timestamp. Pick the date and time, choose how it looks (there are seven styles), add text if you like, then send it, add it to your message or copy it. Everybody sees the time in their own time zone and language.'
const TOAST_KEY = 'MARKLONG_TIMESTAMP_MAKER_SETTINGS'

const ACTIONS: Array<{ id: Action; label: string; about: string }> = [
	{
		id: 'send',
		label: 'Send it',
		about: 'Posts the timestamp in the chat right away',
	},
	{
		id: 'insert',
		label: 'Add to message',
		about: 'Puts it in the message you are writing, so you can add more',
	},
	{
		id: 'copy',
		label: 'Copy it',
		about: 'Copies it so you can paste it anywhere',
	},
]

/** The headline: how it is going, and what to do next. */
function headline(): { label: string; detail: string } {
	if (state.commandHook === 'failed')
		return {
			label: 'Something is not working',
			detail:
				'Discord’s list of built-in commands could not be changed. Press Copy logs below and send the report.',
		}
	if (!setting('command') && !setting('atTime'))
		return {
			label: 'Both ways are off',
			detail: 'Turn on /timestamp or @time below.',
		}
	if (setting('command') && state.commandHook !== 'patched')
		return {
			label: 'Ready',
			detail:
				'Open the / menu in a chat once so the plugin can find it. Then /timestamp is there.',
		}
	return {
		label: 'Working',
		detail: 'Type /timestamp in a chat, or put @time in a message.',
	}
}

/** The settings screen. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	useEffect(() => {
		const stopStore = store.subscribe(() => redraw(n => n + 1))
		const stopDiag = diag.subscribe(() => redraw(n => n + 1))
		return () => {
			stopStore()
			stopDiag()
		}
	}, [])
	const [sure, setSure] = useState(false)

	const status = headline()
	const now = Date.now()
	const h24 = setting('h24')
	const zone = setting('zone')
	const atStyle = setting('atTimeStyle')
	const recents = setting('recents')

	const change = (patch: Partial<TimestampSettings>, text?: string) => {
		update(patch)
		if (text) openToast(TOAST_KEY, text)
	}

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={24}>
				<IntroCard text={INTRO} />

				<Design.TableRowGroup title="Status">
					<Design.TableRow label={status.label} subLabel={status.detail} />
					<Design.TableRow
						label="Made so far"
						subLabel={`${state.sent} sent, ${state.inserted} added to a message, ${state.copied} copied, ${state.atConverted} from @time (since the plugin started)`}
					/>
					<Design.TableRow
						label="Open the popup"
						subLabel="Try it here without going to a chat. Send and Add to message need a chat, Copy always works."
						arrow
						onPress={() => openPopup({})}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Ways to make one">
					<Design.TableSwitchRow
						label="/timestamp command"
						subLabel="In the / menu with Discord’s own commands. Type /timestamp, or /timestamp when:tomorrow 9am to start with a time."
						value={setting('command')}
						onValueChange={(on: boolean) =>
							change(
								{ command: on },
								on ? '/timestamp is on' : '/timestamp is off',
							)
						}
					/>
					<Design.TableSwitchRow
						label="@time in messages"
						subLabel="Turns @time into a timestamp when you send. Switch off if you want to write “@time” as plain text."
						value={setting('atTime')}
						onValueChange={(on: boolean) =>
							change({ atTime: on }, on ? '@time is on' : '@time is off')
						}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="@time examples">
					<Design.TableRow label="@time" subLabel="The moment you send it" />
					<Design.TableRow
						label="@time(tomorrow 9am)"
						subLabel="A time, written any way the popup understands"
					/>
					<Design.TableRow
						label="@time(in 2 hours):R"
						subLabel="Ends with :t :T :d :D :f :F or :R to pick the style"
					/>
					<Design.TableRow
						label="Left alone"
						subLabel="Anything inside `code`, a code block, or words it cannot read, is sent exactly as you typed it."
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup
					title="Style for @time"
					description="Used when you write @time without a style."
				>
					<Design.TableRadioGroup
						key={`at-${atStyle}`}
						defaultValue={atStyle}
						onChange={(value: string) =>
							change({ atTimeStyle: value as Style })
						}
					>
						{STYLES.map(item => (
							<Design.TableRadioRow
								key={item.id}
								value={item.id}
								label={preview(now, item.id, h24, now)}
								subLabel={`${item.name} · ${tag(now, item.id)}`}
							/>
						))}
					</Design.TableRadioGroup>
				</Design.TableRowGroup>

				<Design.TableRowGroup
					title="Main button"
					description="What the big button in the popup does. The other two are right under it."
				>
					<Design.TableRadioGroup
						key={`action-${setting('action')}`}
						defaultValue={setting('action')}
						onChange={(value: string) => change({ action: value as Action })}
					>
						{ACTIONS.map(item => (
							<Design.TableRadioRow
								key={item.id}
								value={item.id}
								label={item.label}
								subLabel={item.about}
							/>
						))}
					</Design.TableRadioGroup>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Popup">
					<Design.TableSwitchRow
						label="Quick picks"
						subLabel="A row of buttons for now, in an hour, tomorrow 9 AM and so on"
						value={setting('quickPicks')}
						onValueChange={(on: boolean) => change({ quickPicks: on })}
					/>
					<Design.TableSwitchRow
						label="Remember my last choices"
						subLabel="Starts the popup with the style, extras and message you used last"
						value={setting('remember')}
						onValueChange={(on: boolean) => change({ remember: on })}
					/>
					<Design.TableSwitchRow
						label="Skip the popup when a time is typed"
						subLabel="/timestamp when:tomorrow 9am makes it at once with the main button. If the time cannot be read, the popup opens."
						value={setting('skipPopup')}
						onValueChange={(on: boolean) => change({ skipPopup: on })}
					/>
					<Design.TableSwitchRow
						label="24-hour clock"
						subLabel="For the previews and the hour button. Discord decides how chat shows it."
						value={h24}
						onValueChange={(on: boolean) => change({ h24: on })}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup
					title="Reading what you type"
					description="For the When box and @time(...)."
				>
					<Design.TableRadioGroup
						key={`order-${setting('order')}`}
						defaultValue={setting('order')}
						onChange={(value: string) =>
							change({ order: value === 'dmy' ? 'dmy' : 'mdy' })
						}
					>
						<Design.TableRadioRow
							value="mdy"
							label="Month first"
							subLabel="3/4 is March 4th"
						/>
						<Design.TableRadioRow
							value="dmy"
							label="Day first"
							subLabel="3/4 is the 3rd of April"
						/>
					</Design.TableRadioGroup>
					<Design.TableSwitchRow
						label="A time that has passed means tomorrow"
						subLabel="Typing 5pm at 7pm gives tomorrow at 5pm instead of earlier today"
						value={setting('rollForward')}
						onValueChange={(on: boolean) => change({ rollForward: on })}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup
					title="Minute buttons"
					description="How many minutes the Minute buttons move the time."
				>
					<Design.TableRadioGroup
						key={`step-${setting('minuteStep')}`}
						defaultValue={String(setting('minuteStep'))}
						onChange={(value: string) => change({ minuteStep: Number(value) })}
					>
						{MINUTE_STEPS.map(step => (
							<Design.TableRadioRow
								key={step}
								value={String(step)}
								label={step === 1 ? '1 minute' : `${step} minutes`}
							/>
						))}
					</Design.TableRadioGroup>
				</Design.TableRowGroup>

				<Design.TableRowGroup
					title="Time zone"
					description="The clock you type and pick in. The timestamp is the same moment for everyone, whatever you choose."
				>
					<Design.TableRow label="Using" subLabel={zoneName(zone)} />
					<Design.TableRow
						label="Earlier by 30 minutes"
						subLabel={
							zone === 'device' ? 'Starts from this phone’s zone' : undefined
						}
						onPress={() => {
							const base =
								zone === 'device' ? -new Date().getTimezoneOffset() : zone
							change({ zone: Math.max(-12 * 60, base - 30) })
						}}
					/>
					<Design.TableRow
						label="Later by 30 minutes"
						onPress={() => {
							const base =
								zone === 'device' ? -new Date().getTimezoneOffset() : zone
							change({ zone: Math.min(14 * 60, base + 30) })
						}}
					/>
					{zone !== 'device' ? (
						<Design.TableRow
							label={`Back to this phone (${offsetName(-new Date().getTimezoneOffset())})`}
							onPress={() =>
								change({ zone: 'device' }, 'Using this phone’s time zone')
							}
						/>
					) : null}
				</Design.TableRowGroup>

				<Design.TableRowGroup
					title="Recent"
					description="Timestamps you made, so you can pick one again in the popup."
				>
					<Design.TableRadioGroup
						key={`recents-${setting('recentsMax')}`}
						defaultValue={String(setting('recentsMax'))}
						onChange={(value: string) => change({ recentsMax: Number(value) })}
					>
						{[0, 3, 5, 10].map(count => (
							<Design.TableRadioRow
								key={count}
								value={String(count)}
								label={count === 0 ? 'Keep none' : `Keep ${count}`}
							/>
						))}
					</Design.TableRadioGroup>
					{recents.length ? (
						<Design.TableRow
							label="Clear the list"
							subLabel={`${recents.length} saved`}
							onPress={() => {
								clearRecents()
								openToast(TOAST_KEY, 'Recent list cleared')
							}}
						/>
					) : null}
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Reset">
					<Design.TableRow
						label={sure ? 'Tap again to reset' : 'Reset all settings'}
						subLabel={
							sure
								? 'This puts every setting back to how a new install starts.'
								: 'Puts every setting on this page back to how a new install starts.'
						}
						onPress={() => {
							if (!sure) {
								setSure(true)
								return
							}
							setSure(false)
							resetAll()
							openToast(TOAST_KEY, 'Settings reset')
						}}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Good to know">
					<Design.TableRow
						label="Everybody sees their own time"
						subLabel="Discord turns <t:…> into each reader’s own time zone and language. The previews here are in your phone’s zone."
					/>
					<Design.TableRow
						label="Hide Slash Apps"
						subLabel="If you use that plugin, /timestamp shows up with Discord’s own commands, so you can switch it off there too."
					/>
					<Design.TableRow
						label="Turn the plugin off"
						subLabel="/timestamp leaves the / menu and @time is sent as plain text again."
					/>
				</Design.TableRowGroup>

				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
