import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { serversToFix, showAllInAll } from './apply'
import { store } from './config'
import { diag } from './diag'
import { allGuilds, isCommunity } from './discord'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { AutoSettings, HistoryEntry } from './config'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: AutoSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'In a community server Discord can hide channels until you opt in to them. Show All Channels turns that off, so you see every channel. This plugin turns it on by itself in each server you join, once, so if you turn it off in a server later it stays off. The button below does the same for the servers you are already in.'
const EMPTY_TITLE = 'Nothing yet'
const EMPTY_HELP =
	'Join a server and it shows up here, or use the button above for the servers you are in.'
const ALL_GOOD = 'Every community server already shows all of its channels.'
const CONFIRM_TITLE = 'Turn on Show All Channels?'

/** `3 min ago` for a time in milliseconds. */
function ago(at: number): string {
	const minutes = Math.round((Date.now() - at) / 60_000)
	if (minutes < 1) return 'just now'
	if (minutes < 120) return `${minutes} min ago`
	if (minutes < 2880) return `${Math.round(minutes / 60)} h ago`
	return `${Math.round(minutes / 1440)} days ago`
}

/** The row of one server that was dealt with. */
function HistoryRow({ entry }: { entry: HistoryEntry }) {
	const how = entry.how === 'joined' ? 'joined' : 'all servers'
	return (
		<Design.TableRow
			label={entry.name}
			subLabel={`${entry.outcome} · ${how} · ${ago(entry.at)}`}
		/>
	)
}

/** The settings screen: the switch, the servers that still hide channels, what was done and the debugging tools. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	const [running, setRunning] = useState('')
	useEffect(() => {
		const stopStore = store.subscribe(() => redraw(n => n + 1))
		const stopDiag = diag.subscribe(() => redraw(n => n + 1))
		// Whether a server hides channels changes in Discord, so the counts are looked at again now and then.
		const timer = setInterval(() => redraw(n => n + 1), 4000)
		return () => {
			stopStore()
			stopDiag()
			clearInterval(timer)
		}
	}, [])

	const servers = allGuilds()
	const community = servers.filter(isCommunity)
	const hidden = serversToFix()
	const history = store.get('history')

	const confirmAll = () =>
		Alert.alert(
			CONFIRM_TITLE,
			`${hidden.length} community server(s) hide channels from you. This shows all of their channels.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Turn on',
					onPress: () => {
						setRunning('Starting…')
						showAllInAll((done, total) =>
							setRunning(`${done} of ${total} done`),
						)
							.catch(error => diag.fail('all servers', error))
							.finally(() => setRunning(''))
					},
				},
			],
			{ cancelable: true },
		)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<Design.TableRowGroup title="Automatic">
					<Design.TableSwitchRow
						label="Show all channels in servers I join"
						subLabel="Turned on once for each new server."
						value={!!store.get('enabled')}
						onValueChange={(value: boolean) => {
							store.set({ enabled: !!value })
							diag.log('setting', `automatic ${value ? 'on' : 'off'}`)
						}}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Your servers">
					<Design.TableRow
						label="Servers"
						subLabel={`${servers.length} in all, ${community.length} community`}
					/>
					<Design.TableRow
						label="Still hiding channels"
						subLabel={
							hidden.length ? `${hidden.length} community server(s)` : 'None'
						}
					/>
				</Design.TableRowGroup>
				<View style={{ marginHorizontal: 16 }}>
					<Design.Card>
						<Design.Stack spacing={10}>
							<Design.Text
								variant="text-md/medium"
								color={hidden.length ? 'text-normal' : 'text-muted'}
							>
								{hidden.length
									? `${hidden.length} server(s) hide some of their channels.`
									: ALL_GOOD}
							</Design.Text>
							<Design.Button
								text={
									hidden.length
										? `Show all channels in ${hidden.length} server(s)`
										: 'Nothing to change'
								}
								variant="primary"
								disabled={!hidden.length || !!running}
								loading={!!running}
								onPress={confirmAll}
							/>
							{running ? (
								<Design.Text variant="text-sm/medium" color="text-muted">
									{running}
								</Design.Text>
							) : null}
						</Design.Stack>
					</Design.Card>
				</View>
				<Design.TableRowGroup title="Recently dealt with">
					{history.length ? (
						history.map(entry => <HistoryRow key={entry.id} entry={entry} />)
					) : (
						<Design.TableRow label={EMPTY_TITLE} subLabel={EMPTY_HELP} />
					)}
				</Design.TableRowGroup>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
