import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { openToast } from '../../../shared/kmmiio/toast'
import { builtInsToShow } from './builtins'
import { diag } from './diag'
import { AppPicture } from './sheet'
import { state } from './state'
import {
	BUILT_IN_APP_ID,
	DEFAULT_SETTINGS,
	hideCommand,
	isCommandHidden,
	onRevision,
	showAll,
	showCommand,
	showEverywhere,
	showInServer,
	store,
} from './store'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type {
	HiddenCommand,
	HiddenEverywhere,
	HiddenInServer,
	HideSettings,
} from './store'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: HideSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Some bots, like MEE6, are in lots of servers and cannot be removed or hidden from Discord’s own settings. This plugin hides them from the / menu: open the menu, press and hold an app’s picture, and choose to hide it everywhere or only in that server. You can also hide single commands, and turn Discord’s own commands off.'
const EMPTY =
	'Nothing is hidden yet. Open the / menu in a chat and press and hold an app’s picture.'
const HEADING_EVERYWHERE = 'Hidden apps'
const HEADING_SERVER = 'Hidden apps in one server'
const HEADING_BUILT_IN = 'Discord’s own commands'
const HEADING_COMMANDS = 'Hidden commands'
const BUILT_IN_HINT =
	'Switch off the ones you never use. Off means hidden everywhere. To hide one in just one server, press and hold it in the / menu.'
const TOAST_KEY = 'MARKLONG_HIDE_SLASH_APPS_SETTINGS'

/** The date something was hidden, as 2026-11-07. */
const day = (at: number): string => {
	try {
		return new Date(at).toISOString().slice(0, 10)
	} catch {
		return ''
	}
}

/** One hidden app, with its picture and a button to show it again. */
function HiddenCard({
	entry,
	note,
	onShow,
}: {
	entry: HiddenEverywhere
	note: string
	onShow: () => void
}) {
	return (
		<Design.Card>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
				<AppPicture app={entry} size={44} />
				<View style={{ flex: 1, gap: 2 }}>
					<Design.Text variant="text-md/medium">{entry.name}</Design.Text>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{note}
					</Design.Text>
				</View>
				<Design.Button
					text="Show again"
					variant="secondary"
					size="sm"
					onPress={onShow}
				/>
			</View>
		</Design.Card>
	)
}

/** One hidden command, with where it is hidden and a button to show it again. */
function CommandCard({
	entry,
	onShow,
}: {
	entry: HiddenCommand
	onShow: () => void
}) {
	const label = `/${entry.name}`
	const note = `${entry.guildId ? `Only in ${entry.guildName || 'a server'}` : 'Everywhere'} · hidden ${day(entry.at)}`
	return (
		<Design.Card>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
				<View style={{ flex: 1, gap: 2 }}>
					<Design.Text variant="text-md/medium">{label}</Design.Text>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{note}
					</Design.Text>
				</View>
				<Design.Button
					text="Show again"
					variant="secondary"
					size="sm"
					onPress={onShow}
				/>
			</View>
		</Design.Card>
	)
}

/** The headline: how it is going, and what to do next. */
function headline(hidden: number): { label: string; detail: string } {
	if (state.discovery === 'failed' || state.query === 'failed')
		return {
			label: 'Something is not working',
			detail:
				'A part of Discord’s / menu could not be changed. Press Copy logs below and send the report.',
		}
	if (state.discovery !== 'patched')
		return {
			label: 'Ready',
			detail:
				'Open the / menu in a chat once so the plugin can find it. Then it is on.',
		}
	if (state.railSeen > 0 && state.railMenu === 0)
		return {
			label: 'Hiding works, the long press does not',
			detail:
				'The app pictures were found but the long press could not be added. Press Copy logs below and send the report.',
		}
	if (state.rowSeen > 0 && state.rowMenu === 0)
		return {
			label: 'Hiding works, the long press on commands does not',
			detail:
				'The command rows were found but the long press could not be added. Press Copy logs below and send the report.',
		}
	return {
		label: 'Working',
		detail: hidden
			? 'What you hid is gone from the / menu.'
			: 'Press and hold an app’s picture or a command in the / menu to hide it.',
	}
}

/** Groups entries by a key, in the order the keys first appear. */
function groupBy<T>(list: T[], key: (item: T) => string): Array<[string, T[]]> {
	const groups = new Map<string, T[]>()
	for (const entry of list) {
		const id = key(entry)
		const group = groups.get(id)
		if (group) group.push(entry)
		else groups.set(id, [entry])
	}
	return [...groups.entries()]
}

/** The settings screen: how to use it, how it is going, the built-in commands, what is hidden (with a way to show it again), and the debugging tools. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	useEffect(() => {
		const stopStore = store.subscribe(() => redraw(n => n + 1))
		const stopRevision = onRevision(() => redraw(n => n + 1))
		const stopDiag = diag.subscribe(() => redraw(n => n + 1))
		return () => {
			stopStore()
			stopRevision()
			stopDiag()
		}
	}, [])
	const [sure, setSure] = useState(false)

	const everywhere = store.get('everywhere') ?? DEFAULT_SETTINGS.everywhere
	const servers = store.get('servers') ?? DEFAULT_SETTINGS.servers
	const commands = store.get('commands') ?? DEFAULT_SETTINGS.commands
	const total = everywhere.length + servers.length + commands.length
	const status = headline(total)
	const commandsEverywhere = commands.filter(entry => !entry.guildId).length

	/** Hidden commands to list: all of them, except built-in ones hidden everywhere, which are the switches above. */
	const listed = commands.filter(
		entry => !(entry.appId === BUILT_IN_APP_ID && !entry.guildId),
	)

	const showAgain = (text: string, action: () => void) => {
		action()
		state.shown++
		diag.log('show', 'Showed something again')
		openToast(TOAST_KEY, text)
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
						label="Hidden apps"
						subLabel={`${everywhere.length} everywhere, ${servers.length} in single servers`}
					/>
					<Design.TableRow
						label="Hidden commands"
						subLabel={`${commandsEverywhere} everywhere, ${commands.length - commandsEverywhere} in single servers`}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="How to hide">
					<Design.TableRow
						label="1. Open the / menu"
						subLabel="In any chat, type / or tap the / button."
					/>
					<Design.TableRow
						label="2. Press and hold"
						subLabel="An app's picture hides the whole app: the round pictures at the bottom of the menu, or the small one by its name. A command in the list hides just that command."
					/>
					<Design.TableRow
						label="3. Choose where"
						subLabel="Hide it everywhere, or only in the server you are in."
					/>
				</Design.TableRowGroup>

				<Design.Stack spacing={12}>
					<View style={{ paddingHorizontal: 16, gap: 4 }}>
						<Design.Text variant="heading-lg/bold">
							{HEADING_BUILT_IN}
						</Design.Text>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{BUILT_IN_HINT}
						</Design.Text>
					</View>
					<Design.TableRowGroup>
						{builtInsToShow(state.builtins).map(item => {
							const inServers = commands.filter(
								entry => entry.id === item.id && !!entry.guildId,
							).length
							return (
								<Design.TableSwitchRow
									key={item.id}
									label={`/${item.name}`}
									subLabel={
										inServers
											? `${item.about} · hidden in ${inServers} server${inServers === 1 ? '' : 's'}`
											: item.about
									}
									value={!isCommandHidden(item.id)}
									onValueChange={(on: boolean) =>
										showAgain(
											on ? `/${item.name} is back` : `/${item.name} is hidden`,
											() =>
												on
													? showCommand(item.id)
													: hideCommand({
															id: item.id,
															name: item.name,
															appId: BUILT_IN_APP_ID,
															appName: 'Built-in',
														}),
										)
									}
								/>
							)
						})}
					</Design.TableRowGroup>
				</Design.Stack>

				<Design.Stack spacing={12}>
					<View style={{ paddingHorizontal: 16 }}>
						<Design.Text variant="heading-lg/bold">
							{HEADING_EVERYWHERE}
						</Design.Text>
					</View>
					{everywhere.length === 0 ? (
						<Design.TableRowGroup>
							<Design.TableRow label="None" subLabel={EMPTY} />
						</Design.TableRowGroup>
					) : (
						everywhere.map(entry => (
							<View key={entry.id} style={{ marginHorizontal: 16 }}>
								<HiddenCard
									entry={entry}
									note={`Hidden ${day(entry.at)} · in every server and DM`}
									onShow={() =>
										showAgain(`${entry.name} is back`, () =>
											showEverywhere(entry.id),
										)
									}
								/>
							</View>
						))
					)}
				</Design.Stack>

				<Design.Stack spacing={12}>
					<View style={{ paddingHorizontal: 16 }}>
						<Design.Text variant="heading-lg/bold">
							{HEADING_SERVER}
						</Design.Text>
					</View>
					{servers.length === 0 ? (
						<Design.TableRowGroup>
							<Design.TableRow
								label="None"
								subLabel="Apps you hide in just one server show up here, under that server."
							/>
						</Design.TableRowGroup>
					) : (
						groupBy<HiddenInServer>(servers, entry => entry.guildId).map(
							([guildId, list]) => (
								<Design.Stack key={guildId} spacing={8}>
									<View style={{ paddingHorizontal: 16 }}>
										<Design.Text variant="text-sm/bold" color="text-muted">
											{(list[0]?.guildName || 'A server').toUpperCase()}
										</Design.Text>
									</View>
									{list.map(entry => (
										<View
											key={`${guildId}:${entry.id}`}
											style={{ marginHorizontal: 16 }}
										>
											<HiddenCard
												entry={entry}
												note={`Hidden ${day(entry.at)} · only in this server`}
												onShow={() =>
													showAgain(
														`${entry.name} is back in this server`,
														() => showInServer(guildId, entry.id),
													)
												}
											/>
										</View>
									))}
								</Design.Stack>
							),
						)
					)}
				</Design.Stack>

				<Design.Stack spacing={12}>
					<View style={{ paddingHorizontal: 16 }}>
						<Design.Text variant="heading-lg/bold">
							{HEADING_COMMANDS}
						</Design.Text>
					</View>
					{listed.length === 0 ? (
						<Design.TableRowGroup>
							<Design.TableRow
								label="None"
								subLabel="Commands you hide one by one show up here, under their app. Discord’s own commands are the switches above."
							/>
						</Design.TableRowGroup>
					) : (
						groupBy<HiddenCommand>(listed, entry => entry.appId).map(
							([appId, list]) => (
								<Design.Stack key={appId} spacing={8}>
									<View style={{ paddingHorizontal: 16 }}>
										<Design.Text variant="text-sm/bold" color="text-muted">
											{(list[0]?.appName || 'An app').toUpperCase()}
										</Design.Text>
									</View>
									{list.map(entry => (
										<View
											key={`${entry.id}:${entry.guildId ?? ''}`}
											style={{ marginHorizontal: 16 }}
										>
											<CommandCard
												entry={entry}
												onShow={() =>
													showAgain(`/${entry.name} is back`, () =>
														showCommand(entry.id, entry.guildId),
													)
												}
											/>
										</View>
									))}
								</Design.Stack>
							),
						)
					)}
				</Design.Stack>

				{total > 0 ? (
					<Design.TableRowGroup title="Reset">
						<Design.TableRow
							label={
								sure ? 'Tap again to show everything' : 'Show everything again'
							}
							subLabel={
								sure
									? 'This brings back every hidden app and command, everywhere.'
									: 'Brings back every app and command you hid, everywhere.'
							}
							onPress={() => {
								if (!sure) {
									setSure(true)
									return
								}
								setSure(false)
								showAgain('Everything is back', showAll)
							}}
						/>
					</Design.TableRowGroup>
				) : null}

				<Design.TableRowGroup title="Good to know">
					<Design.TableRow
						label="Only the / menu"
						subLabel="Apps and commands are hidden from the / menu and from what shows when you type after /. Messages and commands you already sent are not touched."
					/>
					<Design.TableRow
						label="Bots in your own servers"
						subLabel="Hiding a bot does not remove it from a server. It only stops it appearing in your / menu, on this phone."
					/>
					<Design.TableRow
						label="An app with every command hidden"
						subLabel="Disappears from the menu too, so you do not see an empty app."
					/>
					<Design.TableRow
						label="Turn the plugin off"
						subLabel="Everything shows again. Your hidden list is kept for when you turn it back on."
					/>
				</Design.TableRowGroup>

				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
