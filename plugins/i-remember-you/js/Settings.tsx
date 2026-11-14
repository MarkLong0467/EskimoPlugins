/**
 * The list of everyone remembered. A port of `components/ui.tsx` of IRememberYou for Equicord, with each desktop gesture
 * done the phone's way:
 * - a click is a tap: the picture opens the profile, an id copies itself with a toast,
 * - a right click (Equicord's context menu) is a long press, which offers the same choices,
 * - the tooltip on a name ("updated at") is shown by a long press on the name.
 */

import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { Alert, FlatList, Image, Pressable, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { store } from './config'
import { current, isGuildKey } from './data'
import { diag } from './diag'
import { copyWithToast, openUserProfile, stores, toast } from './discord'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { RememberSettings } from './config'
import type { IStorageUser, UsersCollection } from './data'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: RememberSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Provides a list of users you have mentioned or replied to, or those who own the servers you belong to (owner*), or are members of your guild, plus your friends and the people you have DMs and group DMs with'
const EMPTY = "It's empty right now"
const SERVER_COPIED = 'Server ID copied to clipboard'
const USER_COPIED = 'User ID copied to clipboard'

/** The date a person was last seen, as Equicord's tooltip says it. */
function tooltipText(user: IStorageUser) {
	const { updatedAt } = user.extra || {}
	let updatedAtContent: string | null = null
	if (updatedAt) {
		try {
			updatedAtContent = new Intl.DateTimeFormat().format(updatedAt)
		} catch {
			updatedAtContent = new Date(updatedAt).toLocaleDateString()
		}
	}
	return `${user.username ?? user.tag}, updated at ${updatedAtContent}`
}

/** Equicord's server context menu: Copy Server ID. */
function serverMenu(id: string) {
	Alert.alert('Server Options', id, [
		{
			text: 'Copy Server ID',
			onPress: () => copyWithToast(id, SERVER_COPIED),
		},
		{ text: 'Cancel', style: 'cancel' },
	])
}

/** Equicord's user context menu: Copy User ID and View Profile, offered when Discord still knows the user. */
function userMenu(user: IStorageUser) {
	if (!stores().UserStore?.getUser(user.id)) return
	Alert.alert('User Options', user.tag, [
		{
			text: 'Copy User ID',
			onPress: () => copyWithToast(user.id, USER_COPIED),
		},
		{ text: 'View Profile', onPress: () => openUserProfile(user.id) },
		{ text: 'Cancel', style: 'cancel' },
	])
}

/** One remembered person: picture, tag (with "(owner)") and id. */
function UserRow({
	user,
	allowOwner = true,
}: {
	user: IStorageUser
	allowOwner?: boolean
}) {
	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 10,
				paddingHorizontal: 16,
				paddingVertical: 6,
			}}
		>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`Open the profile of ${user.tag}`}
				onPress={() => openUserProfile(user.id)}
			>
				{user.iconURL ? (
					<Image
						source={{ uri: user.iconURL }}
						style={{ width: 24, height: 24, borderRadius: 12 }}
					/>
				) : (
					<View style={{ width: 24, height: 24, borderRadius: 12 }} />
				)}
			</Pressable>
			<View style={{ flex: 1 }}>
				<Pressable onLongPress={() => toast(tooltipText(user))}>
					<Design.Text variant="text-md/semibold" color="text-default">
						{`${user.tag} ${allowOwner && user.extra?.isOwner ? '(owner)' : ''}`.trim()}
					</Design.Text>
				</Pressable>
				<Pressable
					onPress={() => copyWithToast(user.id, USER_COPIED)}
					onLongPress={() => userMenu(user)}
				>
					<Design.Text variant="text-xs/medium" color="text-muted">
						{user.id}
					</Design.Text>
				</Pressable>
			</View>
		</View>
	)
}

/** The heading of a server (or of DMs): its name and, for a server, its id. */
function GroupHeader({ name, id, isGuild }: { name: string; id: string; isGuild: boolean }) {
	return (
		<View
			style={{
				flexDirection: 'row',
				flexWrap: 'wrap',
				alignItems: 'baseline',
				gap: 6,
				paddingHorizontal: 16,
				paddingTop: 18,
				paddingBottom: 4,
			}}
		>
			<Design.Text variant="heading-md/bold" color="text-strong">
				{name}
			</Design.Text>
			{isGuild ? (
				<Pressable
					onPress={() => copyWithToast(id, SERVER_COPIED)}
					onLongPress={() => serverMenu(id)}
				>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{`(${id})`}
					</Design.Text>
				</Pressable>
			) : null}
		</View>
	)
}

/** A line of the list: a heading or a person. */
type Item =
	| { kind: 'header'; key: string; name: string; id: string; isGuild: boolean }
	| { kind: 'user'; key: string; user: IStorageUser; allowOwner: boolean }

/** The servers, the most people first, each with its people. */
function rowsOf(usersCollection: UsersCollection): Item[] {
	const items: Item[] = []
	for (const { key, id, name, users } of Object.entries(usersCollection)
		.map(([key, { users, name, id }]) => ({
			key,
			id: id || key,
			name,
			users: Object.values(users),
		}))
		.sort((a, b) => b.users.length - a.users.length)) {
		const isGuild = isGuildKey(key, id)
		items.push({ kind: 'header', key: `g:${key}`, name, id, isGuild })
		for (const user of users)
			items.push({ kind: 'user', key: `${key}:${user.id}`, user, allowOwner: true })
	}
	return items
}

/** The search: people whose tag or username has the text in it. */
function searchRows(usersCollection: UsersCollection, text: string): Item[] {
	const list = Object.values(usersCollection).flatMap(col =>
		Object.values(col.users),
	)
	return list
		.filter(user => user.tag.includes(text) || user.username.includes(text))
		.map((user, index) => ({
			kind: 'user' as const,
			key: `s:${index}:${user.id}`,
			user,
			allowOwner: false,
		}))
}

/** The settings screen: the intro, the search and everyone remembered. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [search, setSearch] = useState('')
	// The running plugin's list has the people met in the last three minutes too; the saved one is used when it is off.
	const usersCollection = current?.usersCollection ?? store.get('data')
	const empty = Object.keys(usersCollection).length === 0
	const items = search
		? [
				...searchRows(usersCollection, search),
				...(empty ? [] : rowsOf(usersCollection)),
			]
		: rowsOf(usersCollection)

	return (
		<FlatList
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			data={items}
			keyExtractor={item => item.key}
			initialNumToRender={30}
			windowSize={11}
			keyboardShouldPersistTaps="handled"
			ListHeaderComponent={
				<View style={{ paddingTop: 20, gap: 14 }}>
					<IntroCard text={INTRO} />
					<View style={{ marginHorizontal: 16 }}>
						<Design.TextInput
							placeholder="Filter by tag, username"
							size="md"
							value={search}
							onChange={(value: string) => setSearch(value)}
						/>
					</View>
					{empty ? (
						<View style={{ marginHorizontal: 16 }}>
							<Design.Text variant="text-md/medium" color="text-muted">
								{EMPTY}
							</Design.Text>
						</View>
					) : null}
				</View>
			}
			renderItem={({ item }) =>
				item.kind === 'header' ? (
					<GroupHeader name={item.name} id={item.id} isGuild={item.isGuild} />
				) : (
					<UserRow user={item.user} allowOwner={item.allowOwner} />
				)
			}
			ListFooterComponent={
				<View style={{ paddingTop: 22 }}>
					<DebugSection diag={diag} />
				</View>
			}
		/>
	)
}
