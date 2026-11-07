import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Image, ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { openToast } from '../../../shared/kmmiio/toast'
import { diag } from './diag'
import { addPeople, isSilenced, removePerson } from './list'
import { avatarOf, copyText, lookupUser, personOf } from './people'
import { state } from './state'
import { MAX_USERS, setting, store } from './store'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings as SilenceSettings } from './store'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: SilenceSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Silences the pings from people you choose, so they do not add to the red numbers on server badges or make a pop-up, while their messages still arrive and read like any other. Add people below or with /silence. You can also silence everyone’s pings, @everyone and @here, or role pings.'
const TOAST_KEY = 'MARKLONG_SILENCE_USERS_SETTINGS'
const PEOPLE_TITLE = 'Add people'
const HOW_TO_FIND =
	'To get someone’s ID: Settings > Advanced > turn on Developer Mode, then long-press them and choose Copy User ID. You can paste several IDs at once, separated by commas or spaces. Or just type /silence in a chat and pick the person.'

/** What a pasted text did, in words. */
function describeAdd(result: ReturnType<typeof addPeople>): {
	text: string
	bad: boolean
} {
	const parts: string[] = []
	if (result.added.length)
		parts.push(
			`${result.added.length} ${result.added.length === 1 ? 'person' : 'people'} silenced`,
		)
	if (result.already.length)
		parts.push(`${result.already.length} already silenced`)
	if (result.full.length)
		parts.push(`${result.full.length} not added, the list holds ${MAX_USERS}`)
	if (result.invalid.length)
		parts.push(
			`${result.invalid.length} not understood (an ID is 15 to 21 digits)`,
		)
	return {
		text: parts.join(', ') || 'Nothing to add',
		bad: result.added.length === 0,
	}
}

/** The headline: how it is going. */
function headline(): { label: string; detail: string } {
	if (state.hook === 'failed')
		return {
			label: 'Something is not working',
			detail:
				'The plugin could not hook into Discord’s events. Press Copy logs below and send the report.',
		}
	if (state.failures > 0)
		return {
			label: 'Some events caused errors',
			detail:
				'Pings may not be silenced. Press Copy logs below and send the report.',
		}
	const silenced =
		state.clearedDirect + state.clearedEveryone + state.clearedRoles
	const anyone =
		setting('users').length > 0 ||
		setting('silenceAll') ||
		setting('silenceEveryone') ||
		setting('silenceRoles')
	if (!anyone)
		return {
			label: 'Nobody is silenced yet',
			detail: 'Add someone below, or turn on one of the switches for everyone.',
		}
	return {
		label: 'Working',
		detail: `${silenced} ping${silenced === 1 ? '' : 's'} silenced since the plugin started.`,
	}
}

/** The settings screen. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	const [text, setText] = useState('')
	const [feedback, setFeedback] = useState<{
		text: string
		bad: boolean
	} | null>(null)
	useEffect(() => {
		const stopStore = store.subscribe(() => redraw(n => n + 1))
		const stopDiag = diag.subscribe(() => redraw(n => n + 1))
		return () => {
			stopStore()
			stopDiag()
		}
	}, [])

	const users = setting('users')
	const people = users.map(personOf)
	const unknown = people
		.filter(p => !p.known)
		.map(p => p.id)
		.join(',')

	// Ask Discord who the people it has not told us about are, one time each.
	useEffect(() => {
		if (!unknown) return
		let stopped = false
		for (const id of unknown.split(',')) {
			lookupUser(id).then(found => {
				if (found && !stopped) redraw(n => n + 1)
			})
		}
		return () => {
			stopped = true
		}
	}, [unknown])

	const status = headline()
	const set = (patch: Partial<SilenceSettings>, said?: string) => {
		store.set(patch)
		diag.log('settings', Object.keys(patch).join(', '))
		if (said) openToast(TOAST_KEY, said)
	}
	const submit = () => {
		const result = addPeople(text, true)
		setFeedback(describeAdd(result))
		if (result.added.length > 0 || result.already.length > 0) setText('')
	}

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={24}>
				<IntroCard text={INTRO} />

				<Design.TableRowGroup title="Status">
					<Design.TableRow label={status.label} subLabel={status.detail} />
					<Design.TableRow
						label="Messages from silenced people"
						subLabel={`${state.fromSilenced} since the plugin started`}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title={`Silenced people (${users.length})`}>
					{people.length === 0 ? (
						<Design.TableRow
							label="Nobody yet"
							subLabel="Add people below, or use /silence in a chat."
						/>
					) : (
						people.map(person => (
							<Design.TableRow
								key={person.id}
								label={person.name}
								subLabel={
									person.handle
										? `${person.handle} · tap to copy the ID`
										: `${person.id} · tap to copy`
								}
								icon={
									<Image
										source={{ uri: person.avatar }}
										style={{ width: 32, height: 32, borderRadius: 16 }}
									/>
								}
								trailing={
									<Design.Button
										text="Remove"
										variant="secondary"
										size="sm"
										onPress={() => removePerson(person.id)}
									/>
								}
								onPress={() => {
									copyText(person.id)
									openToast(TOAST_KEY, 'ID copied')
								}}
							/>
						))
					)}
				</Design.TableRowGroup>

				<View style={{ marginHorizontal: 16, gap: 10 }}>
					<Design.Text variant="text-lg/semibold">{PEOPLE_TITLE}</Design.Text>
					<Design.TextInput
						label="User IDs"
						placeholder="123456789012345678, 234567890123456789"
						size="md"
						value={text}
						onChange={(value: string) => {
							setText(value)
							setFeedback(null)
						}}
					/>
					<Design.Button
						text="Silence them"
						variant="primary"
						size="md"
						disabled={text.trim() === ''}
						onPress={submit}
					/>
					{feedback ? (
						<Design.Text
							variant="text-sm/medium"
							color={feedback.bad ? 'text-danger' : 'text-muted'}
						>
							{feedback.text}
						</Design.Text>
					) : null}
					<Design.Text variant="text-sm/medium" color="text-muted">
						{HOW_TO_FIND}
					</Design.Text>
				</View>

				<Design.TableRowGroup title="Pinged you recently">
					{state.recent.length === 0 ? (
						<Design.TableRow
							label="Nobody has pinged you yet"
							subLabel="People who @mention you, reply to you or use @everyone show up here, so you can silence them with one tap. This list starts empty each time Discord starts."
						/>
					) : (
						state.recent.map(pinger => {
							const silenced = isSilenced(pinger.id)
							const who = personOf(pinger.id)
							return (
								<Design.TableRow
									key={pinger.id}
									label={who.known ? who.name : pinger.name}
									subLabel={`${pinger.pings} ping${pinger.pings === 1 ? '' : 's'}${
										pinger.silenced ? `, ${pinger.silenced} silenced` : ''
									}`}
									icon={
										<Image
											source={{
												uri: who.known
													? who.avatar
													: avatarOf(pinger.id, pinger.avatar),
											}}
											style={{ width: 32, height: 32, borderRadius: 16 }}
										/>
									}
									trailing={
										<Design.Button
											text={silenced ? 'Silenced' : 'Silence'}
											variant={silenced ? 'secondary' : 'primary'}
											size="sm"
											disabled={silenced}
											onPress={() => {
												addPeople(pinger.id)
												redraw(n => n + 1)
											}}
										/>
									}
								/>
							)
						})
					)}
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Silence more">
					<Design.TableSwitchRow
						label="Silence everyone’s pings"
						subLabel="Nobody’s @mentions or replies add to your badges or make a pop-up. Messages are still delivered. A catch-all if you do not want to pick people."
						value={setting('silenceAll')}
						onValueChange={(on: boolean) =>
							set(
								{ silenceAll: on },
								on
									? 'Everyone’s pings are silenced'
									: 'Only chosen people are silenced',
							)
						}
					/>
					<Design.TableSwitchRow
						label="Silence @everyone and @here"
						subLabel="Takes the @everyone and @here out of messages from anyone."
						value={setting('silenceEveryone')}
						onValueChange={(on: boolean) =>
							set(
								{ silenceEveryone: on },
								on
									? '@everyone and @here are silenced'
									: '@everyone and @here are back',
							)
						}
					/>
					<Design.TableSwitchRow
						label="Silence role pings"
						subLabel="Takes role mentions out of messages from anyone."
						value={setting('silenceRoles')}
						onValueChange={(on: boolean) =>
							set(
								{ silenceRoles: on },
								on ? 'Role pings are silenced' : 'Role pings are back',
							)
						}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="The /silence command">
					<Design.TableSwitchRow
						label="/silence command"
						subLabel="/silence user:@someone silences that person, or lets them ping you again if they are already silenced."
						value={setting('command')}
						onValueChange={(command: boolean) =>
							set({ command }, command ? '/silence added' : '/silence removed')
						}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Good to know">
					<Design.TableRow
						label="Only pings are silenced"
						subLabel="Their messages still arrive and show in the chat. Only the part that pings you is taken out, before Discord counts it."
					/>
					<Design.TableRow
						label="Only new messages"
						subLabel="A number already on a server badge stays until you read the chat. Direct messages are not changed."
					/>
					<Design.TableRow
						label="Phone notifications"
						subLabel="Notifications that Discord’s servers send to your phone while the app is closed cannot be stopped by a plugin. Muting the chat or the person in Discord does that."
					/>
					<Design.TableRow
						label="Turn the plugin off"
						subLabel="Everyone pings you as normal again."
					/>
				</Design.TableRowGroup>

				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
