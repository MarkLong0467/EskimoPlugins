import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { listenToSettings, saveSettings, setStorage, setting } from './config'
import { MAX_SUGGESTIONS, VERSION } from './constants'
import {
	allDirectMessageIds,
	allGuilds,
	channelLabel,
	guildLabel,
	listEntryForChat,
	userLabel,
} from './discord'
import { addPeopleFromText, listSize, readList, setOnList } from './list'
import { copyReport } from './report'
import { hooks } from './state'
import { toast } from './toast'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps, ReactNode } from 'react'
import type { BypassSettings, ListKind } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: BypassSettings }>
>

/** The texts of the screen. Constants because React Native text must be passed as an expression. */
const EVERYONE_ON =
	'Everyone can notify you while your status is Do Not Disturb.'
const WHO_TITLE = 'Who can bypass'
const EVERYONE_HINT =
	'Off: only the people, chats and servers below. On: every message gets through Do Not Disturb.'
const BANNER_HINT =
	"Discord shows its own banner and sound. This adds a short message and one buzz as well. It turns itself on by itself if Discord's function cannot be found."
const ABOUT_HINT =
	"While Discord is open, messages from your sources get Discord's normal notification even in Do Not Disturb. A notification Discord sends to your phone while the app is closed is decided by Discord's servers, which this plugin cannot change."

/** A rounded box that groups the header. */
function Card({ children }: { children?: ReactNode }) {
	return (
		<View
			style={{
				borderRadius: 14,
				padding: 14,
				gap: 10,
				backgroundColor: '#2b2d31',
			}}
		>
			{children}
		</View>
	)
}

/**
 * The settings screen: a header with the state and a report button, the "Everyone" switch, the lists of chosen people,
 * chats and servers with a way to add more (by pasting ids, from the clipboard, or by picking from a search), the own
 * banner options, and notes on what the plugin can and cannot do.
 * It draws itself again whenever a setting changes.
 */
export default function SettingsScreen({ api }: Props) {
	setStorage(api.jsonStorage)
	api.jsonStorage.use()

	const [, setRedraws] = useState(0)
	const [search, setSearch] = useState('')
	const [pasted, setPasted] = useState('')
	useEffect(() => listenToSettings(() => setRedraws(n => n + 1)), [])

	const list = readList()
	const everyone = !!setting('everyone')
	const query = String(search).toLowerCase().trim()
	const matches = (label: string) =>
		!query || String(label).toLowerCase().includes(query)

	const chosenRow = (
		kind: ListKind,
		id: string,
		label: string,
		hint: string,
	) => (
		<Design.TableRow
			key={`${kind}${id}`}
			label={label}
			subLabel={`${hint} Tap to remove.`}
			onPress={() => {
				setOnList(kind, id, false)
				toast('Removed')
			}}
		/>
	)
	const addRow = (kind: ListKind, id: string, label: string) => (
		<Design.TableRow
			key={`add${kind}${id}`}
			label={label}
			subLabel="Tap to add"
			onPress={() => {
				setOnList(kind, id, true)
				toast(`Added ${label}`)
			}}
		/>
	)

	const peopleRows = list.users.map(id =>
		chosenRow('users', id, userLabel(id), `ID ${id}.`),
	)
	const channelRows = list.channels.map(id =>
		chosenRow('channels', id, channelLabel(id), 'This chat or channel.'),
	)
	const serverRows = list.guilds.map(id =>
		chosenRow('guilds', id, guildLabel(id), 'Every channel of this server.'),
	)
	const chatsToAdd = allDirectMessageIds()
		.filter(id => {
			const entry = listEntryForChat(id)
			return !list[entry.kind].includes(entry.id) && matches(channelLabel(id))
		})
		.slice(0, MAX_SUGGESTIONS)
	const serversToAdd = allGuilds()
		.filter(
			guild => !list.guilds.includes(guild.id) && matches(guild.name || ''),
		)
		.slice(0, MAX_SUGGESTIONS)

	const addPasted = () => {
		const count = addPeopleFromText(pasted)
		setPasted('')
		toast(
			count
				? `Added ${count} ${count === 1 ? 'person' : 'people'}`
				: 'No new IDs found in that text',
		)
	}
	const addFromClipboard = () => {
		Promise.resolve(Clipboard.getString()).then(
			text => {
				const count = addPeopleFromText(text)
				toast(
					count
						? `Added ${count} from the clipboard`
						: 'No new IDs in the clipboard',
				)
			},
			() => toast('Could not read the clipboard'),
		)
	}

	const count = listSize()
	const title = `Bypass Status ${VERSION}`
	const summary = everyone
		? EVERYONE_ON
		: `${count ? `${count} on the list. ` : 'The list is empty. '}Only they can notify you while your status is Do Not Disturb.`
	const working =
		hooks.notificationUtils === 'found'
			? `Hooked into Discord's notification function. ${hooks.bypassed} message(s) let through so far.`
			: "Discord's notification function was not found, so only this plugin's own banner is used."

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack
				style={{ paddingVertical: 20, paddingHorizontal: 12 }}
				spacing={22}
			>
				<Card>
					<Design.Text variant="heading-lg/bold">{title}</Design.Text>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{summary}
					</Design.Text>
					<View style={{ flexDirection: 'row', gap: 10 }}>
						<View style={{ flex: 1 }}>
							<Design.Button
								text="Copy report"
								variant="secondary"
								size="sm"
								onPress={copyReport}
							/>
						</View>
					</View>
				</Card>
				<Design.TableRowGroup title={WHO_TITLE}>
					<Design.TableSwitchRow
						key="everyone"
						label="Everyone"
						subLabel={EVERYONE_HINT}
						value={everyone}
						onValueChange={(value: boolean) =>
							saveSettings({ everyone: !!value })
						}
					/>
				</Design.TableRowGroup>
				{!everyone && (
					<Design.TableRowGroup title="People (paste their IDs)">
						<Design.TextInput
							key="paste"
							label="User IDs"
							description="Paste one or more IDs, separated by commas, spaces or new lines."
							placeholder="123456789012345678, 234567890123456789"
							size="md"
							value={pasted}
							onChange={(value: string) => setPasted(value)}
						/>
						<View
							key="pasteButtons"
							style={{ flexDirection: 'row', gap: 10, paddingVertical: 8 }}
						>
							<View style={{ flex: 1 }}>
								<Design.Button
									text="Add"
									variant="primary"
									size="sm"
									onPress={addPasted}
								/>
							</View>
							<View style={{ flex: 1 }}>
								<Design.Button
									text="Add from clipboard"
									variant="secondary"
									size="sm"
									onPress={addFromClipboard}
								/>
							</View>
						</View>
						{peopleRows.length ? (
							peopleRows
						) : (
							<Design.TableRow
								key="nobody"
								label="Nobody yet"
								subLabel="Hold a direct message and choose Bypass Do Not Disturb, or paste an ID above."
							/>
						)}
					</Design.TableRowGroup>
				)}
				{!everyone && (
					<Design.TableRowGroup title="Channels and group chats">
						{channelRows.length ? (
							channelRows
						) : (
							<Design.TableRow
								key="nochannel"
								label="None yet"
								subLabel="Hold a channel or a group chat."
							/>
						)}
					</Design.TableRowGroup>
				)}
				{!everyone && (
					<Design.TableRowGroup title="Servers">
						{serverRows.length ? (
							serverRows
						) : (
							<Design.TableRow
								key="noserver"
								label="None yet"
								subLabel="Hold a server."
							/>
						)}
					</Design.TableRowGroup>
				)}
				{!everyone && (
					<Design.TextInput
						label="Find a chat or a server"
						placeholder="Search"
						size="md"
						value={search}
						onChange={(value: string) => setSearch(value)}
					/>
				)}
				{!everyone && (
					<Design.TableRowGroup title="Add a chat">
						{chatsToAdd.length ? (
							chatsToAdd.map(id =>
								addRow(
									listEntryForChat(id).kind,
									listEntryForChat(id).id,
									channelLabel(id),
								),
							)
						) : (
							<Design.TableRow
								key="nochats"
								label={query ? 'No match' : 'No chats found'}
								subLabel="Open the Messages tab once so Discord loads the list."
							/>
						)}
					</Design.TableRowGroup>
				)}
				{!everyone && (
					<Design.TableRowGroup title="Add a server">
						{serversToAdd.length ? (
							serversToAdd.map(guild =>
								addRow('guilds', guild.id, guild.name || ''),
							)
						) : (
							<Design.TableRow
								key="noservers"
								label={query ? 'No match' : 'No servers found'}
							/>
						)}
					</Design.TableRowGroup>
				)}
				<Design.TableRowGroup title="Notice">
					<Design.TableSwitchRow
						key="ownBanner"
						label="Also show a banner of this plugin"
						subLabel={BANNER_HINT}
						value={!!setting('ownBanner')}
						onValueChange={(value: boolean) =>
							saveSettings({ ownBanner: !!value })
						}
					/>
					<Design.TableSwitchRow
						key="ownBannerBuzz"
						label="Buzz with that banner"
						value={!!setting('ownBannerBuzz')}
						onValueChange={(value: boolean) =>
							saveSettings({ ownBannerBuzz: !!value })
						}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="About">
					<Design.TableRow
						key="about"
						label="What it can do"
						subLabel={ABOUT_HINT}
					/>
					<Design.TableRow
						key="state"
						label="Is it working?"
						subLabel={working}
					/>
					{hooks.error && (
						<Design.TableRow
							key="error"
							label="Problem"
							subLabel={hooks.error}
						/>
					)}
				</Design.TableRowGroup>
			</Design.Stack>
		</ScrollView>
	)
}
