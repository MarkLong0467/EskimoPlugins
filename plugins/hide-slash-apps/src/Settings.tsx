import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { openToast } from '../../../shared/kmmiio/toast'
import { diag } from './diag'
import { AppPicture } from './sheet'
import { state } from './state'
import {
	DEFAULT_SETTINGS,
	onRevision,
	showAll,
	showEverywhere,
	showInServer,
	store,
} from './store'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { HiddenEverywhere, HiddenInServer, HideSettings } from './store'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: HideSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Some bots, like MEE6, are in lots of servers and cannot be removed or hidden from Discord’s own settings. This plugin hides them from the / menu: open the menu, press and hold an app’s picture, and choose to hide it everywhere or only in that server.'
const EMPTY =
	'Nothing is hidden yet. Open the / menu in a chat and press and hold an app’s picture.'
const HEADING_EVERYWHERE = 'Hidden everywhere'
const HEADING_SERVER = 'Hidden in one server'
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
	return {
		label: 'Working',
		detail: hidden
			? 'The apps you hid are gone from the / menu.'
			: 'Press and hold an app’s picture in the / menu to hide it.',
	}
}

/** Groups the servers' entries by server, in the order they were first hidden. */
function byServer(list: HiddenInServer[]): Array<[string, HiddenInServer[]]> {
	const groups = new Map<string, HiddenInServer[]>()
	for (const entry of list) {
		const group = groups.get(entry.guildId)
		if (group) group.push(entry)
		else groups.set(entry.guildId, [entry])
	}
	return [...groups.entries()]
}

/** The settings screen: how to use it, how it is going, what is hidden (with a way to show it again), and the debugging tools. */
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
	const total = everywhere.length + servers.length
	const status = headline(total)

	const showAgain = (text: string, action: () => void) => {
		action()
		state.shown++
		diag.log('show', 'Showed an app again')
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
						label="Hidden"
						subLabel={`${everywhere.length} everywhere, ${servers.length} in single servers`}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="How to hide an app">
					<Design.TableRow
						label="1. Open the / menu"
						subLabel="In any chat, type / or tap the / button."
					/>
					<Design.TableRow
						label="2. Press and hold the app's picture"
						subLabel="The round pictures at the bottom of the menu, or the one next to its name above its commands."
					/>
					<Design.TableRow
						label="3. Choose where"
						subLabel="Hide it everywhere, or only in the server you are in."
					/>
				</Design.TableRowGroup>

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
						byServer(servers).map(([guildId, list]) => (
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
												showAgain(`${entry.name} is back in this server`, () =>
													showInServer(guildId, entry.id),
												)
											}
										/>
									</View>
								))}
							</Design.Stack>
						))
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
									? 'This brings back every hidden app, everywhere.'
									: 'Brings back every app you hid, everywhere.'
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
						subLabel="Apps are hidden from the / menu and from what shows when you type after /. Their messages and commands you already sent are not touched."
					/>
					<Design.TableRow
						label="Bots in your own servers"
						subLabel="Hiding a bot does not remove it from a server. It only stops it appearing in your / menu, on this phone."
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
