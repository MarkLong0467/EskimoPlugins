import { Dispatcher } from '@valenced/discord/common/flux'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useEffect, useState } from 'react'
import { Image, View } from 'react-native'
import ActionSheetBody from './ActionSheetBody'
import { chevron } from './Chevron'
import { FRIENDS_KEY, SHEET_KEY } from './constants'
import {
	apiGet,
	findByProps,
	openProfile,
	sheets,
	store,
	toast,
} from './discord'
import FriendsSheet from './FriendsSheet'
import { assetUrl, avatarUrl, createdOn, formatNumber } from './format'
import { getGuildFriends } from './friends'
import { fetchOnline } from './online'
import { ownerCache } from './state'
import type { ReactNode } from 'react'
import type {
	ChangeStore,
	ChannelStore,
	CountStore,
	Friend,
	GuildStore,
	MemberStore,
	RoleStore,
	UserStore,
} from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const NO_FRIENDS_LOADING = 'Loading...'
const NO_ONLINE_YET = 'Loading...'
const CLOSE = 'Close'
const OVERVIEW = 'Overview'
const DETAILS = 'Server details'

/** One row of a table. The label is also its key. */
function Row({
	label,
	subLabel,
	...extra
}: {
	label: string
	subLabel: string
	icon?: ReactNode
	trailing?: ReactNode
	onPress?: () => void
}) {
	return <Design.TableRow label={label} subLabel={subLabel} {...extra} />
}

/** Opens the list of friends in a server in its own sheet. */
function openFriends(friends: Friend[], guildId: string): void {
	sheets().openLazy(
		Promise.resolve({
			default: () => <FriendsSheet friends={friends} guildId={guildId} />,
		}),
		FRIENDS_KEY,
		{},
	)
}

/**
 * The Server Info sheet: the server's banner, icon, name and description, then how many members, friends, roles and
 * channels it has, its boosts, owner, vanity link, creation date and id.
 *
 * The sheet draws again when Discord's stores change. The slow things are found in the background and filled in when
 * they arrive: your friends in the server, and the owner when the server data does not say who it is (asked from
 * Discord's web API, then remembered in `ownerCache`).
 */
export default function ServerInfoSheet({ guildId }: { guildId: string }) {
	const [, setTick] = useState(0)
	const [friends, setFriends] = useState<Friend[]>([])
	const [friendsLoading, setFriendsLoading] = useState(true)
	const forceUpdate = () => setTick(n => n + 1)

	const GuildStore = store<GuildStore>('GuildStore')
	const UserStore = store<UserStore>('UserStore')
	const GuildRoleStore = store<RoleStore>('GuildRoleStore')
	const GuildChannelStore = store<ChannelStore>('GuildChannelStore')
	const GuildMemberStore = store<MemberStore>('GuildMemberStore')
	const counts =
		store<CountStore>('GuildMemberCountStore') ||
		findByProps<CountStore>('getMemberCount', 'getOnlineCount')
	const headerCounts = store<CountStore>('GuildHeaderCountsStore') || counts

	// Redraw when what the sheet shows changes.
	useEffect(() => {
		const watched = [
			GuildStore,
			UserStore,
			GuildRoleStore,
			GuildChannelStore,
			counts,
			headerCounts,
		].filter(Boolean) as ChangeStore[]
		for (const watch of watched) watch.addChangeListener?.(forceUpdate)
		return () => {
			for (const watch of watched) watch.removeChangeListener?.(forceUpdate)
		}
	}, [])

	// Friends you have in this server.
	useEffect(() => {
		let mounted = true
		setFriendsLoading(true)
		getGuildFriends(guildId).then(
			list => {
				if (mounted) {
					setFriends(list)
					setFriendsLoading(false)
				}
			},
			() => {
				if (mounted) setFriendsLoading(false)
			},
		)
		return () => {
			mounted = false
		}
	}, [guildId])

	const guild = GuildStore?.getGuild?.(guildId)
	const cached = ownerCache.get(guildId)
	const [ownerId, setOwnerId] = useState<string | null>(
		guild?.ownerId || cached?.id || null,
	)
	const [ownerNameState, setOwnerName] = useState<string | null>(
		cached?.name || null,
	)
	// How many are online, when the stores do not know: asked from Discord's web API (with_counts gives a rounded count).
	const [askedOnline, setAskedOnline] = useState<number | string | null>(null)
	const [ownerAvatar, setOwnerAvatar] = useState<string | null>(
		cached?.avatar || null,
	)

	// The owner, when the guild does not say.
	useEffect(() => {
		if (ownerId) return
		let cancelled = false
		apiGet(`/guilds/${guildId}`).then(
			body => {
				const owner = (body as { owner_id?: unknown } | undefined)?.owner_id
				if (!cancelled && owner) setOwnerId(String(owner))
			},
			() => {},
		)
		return () => {
			cancelled = true
		}
	}, [guildId, ownerId])

	// The owner's name and avatar, from Discord or from a lookup.
	useEffect(() => {
		if (!ownerId) return
		const known = UserStore?.getUser(ownerId)
		if (known?.username) {
			const name = known.globalName || known.username
			setOwnerName(name)
			setOwnerAvatar(known.avatar || null)
			ownerCache.set(guildId, {
				id: ownerId,
				name,
				avatar: known.avatar || null,
			})
			return
		}
		let cancelled = false
		apiGet(`/users/${ownerId}`).then(
			body => {
				const user = body as
					| {
							global_name?: string
							globalName?: string
							username?: string
							avatar?: string
					  }
					| undefined
				if (!user || cancelled) return
				const name =
					user.global_name || user.globalName || user.username || null
				try {
					Dispatcher.dispatch({ type: 'USER_UPDATE', user } as never)
				} catch {
					// The name is still shown from the lookup.
				}
				setOwnerName(name)
				setOwnerAvatar(user.avatar || null)
				ownerCache.set(guildId, {
					id: ownerId,
					name,
					avatar: user.avatar || null,
				})
				forceUpdate()
			},
			() => {},
		)
		return () => {
			cancelled = true
		}
	}, [ownerId, guildId])

	// The number online, when neither store has it.
	const storeKnowsOnline =
		(headerCounts?.getOnlineCount?.(guildId) ??
			counts?.getOnlineCount?.(guildId)) != null
	useEffect(() => {
		if (storeKnowsOnline) return
		let cancelled = false
		fetchOnline(guildId).then(
			n => {
				if (!cancelled) setAskedOnline(n)
			},
			e => {
				if (!cancelled)
					setAskedOnline(`Not available (${String(e?.message || e)})`)
			},
		)
		return () => {
			cancelled = true
		}
	}, [guildId, storeKnowsOnline])

	if (!guild) return null

	const bannerUrl = guild.banner
		? assetUrl('banners', guildId, guild.banner, 512)
		: null
	const iconUrl = guild.icon
		? assetUrl('icons', guildId, guild.icon, 256)
		: null

	// The member count from the first place that has one.
	let rawMembers: number | string | null | undefined =
		counts?.getMemberCount?.(guildId)
	if (rawMembers == null) rawMembers = guild.memberCount
	if (rawMembers == null) rawMembers = guild.approximateMemberCount
	if (rawMembers == null && GuildMemberStore?.getMemberIds)
		rawMembers = (GuildMemberStore.getMemberIds(guildId) || []).length
	let rawOnline: number | string | null | undefined =
		headerCounts?.getOnlineCount?.(guildId)
	if (rawOnline == null) rawOnline = counts?.getOnlineCount?.(guildId)
	if (rawOnline == null) rawOnline = askedOnline

	const roles = GuildRoleStore?.getSortedRoles
		? (GuildRoleStore.getSortedRoles(guildId) || []).length
		: null
	const channels = GuildChannelStore?.getChannels
		? Object.keys(GuildChannelStore.getChannels(guildId) || {}).length
		: null

	const ownerMember = ownerId
		? GuildMemberStore?.getMember?.(guildId, ownerId)
		: null
	const ownerName =
		ownerMember?.nick ||
		ownerNameState ||
		(ownerId ? `User (${String(ownerId).slice(0, 6)})` : 'Loading...')
	const vanity = guild.vanityURLCode
		? `discord.gg/${guild.vanityURLCode}`
		: null

	return (
		<ActionSheetBody>
			{bannerUrl ? (
				<Image
					source={{ uri: bannerUrl }}
					style={{ width: '100%', height: 120, borderRadius: 8 }}
					resizeMode="cover"
				/>
			) : null}
			<View style={{ flexDirection: 'row', alignItems: 'center' }}>
				{iconUrl ? (
					<Image
						source={{ uri: iconUrl }}
						style={{ width: 64, height: 64, borderRadius: 12 }}
					/>
				) : (
					<View
						style={{
							width: 64,
							height: 64,
							borderRadius: 12,
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<Design.Text variant="heading-lg/bold">
							{String(guild.name || '').slice(0, 2)}
						</Design.Text>
					</View>
				)}
				<View style={{ flex: 1, marginLeft: 14 }}>
					<Design.Text variant="heading-lg/bold" numberOfLines={2}>
						{guild.name}
					</Design.Text>
				</View>
			</View>
			{guild.description ? (
				<Design.Text variant="text-sm/medium" color="text-muted">
					{guild.description}
				</Design.Text>
			) : null}
			<Design.TableRowGroup title={OVERVIEW}>
				<Row
					key="Members"
					label="Members"
					subLabel={String(formatNumber(rawMembers == null ? '—' : rawMembers))}
				/>
				<Row
					key="Online"
					label="Online"
					subLabel={
						rawOnline == null ? NO_ONLINE_YET : String(formatNumber(rawOnline))
					}
				/>
				{friendsLoading ? (
					<Row
						key="Friends"
						label="Friends in this server"
						subLabel={NO_FRIENDS_LOADING}
					/>
				) : (
					<Row
						key="Friends"
						label="Friends in this server"
						subLabel={`${friends.length} friend${friends.length === 1 ? '' : 's'}`}
						trailing={chevron()}
						onPress={() => openFriends(friends, guildId)}
					/>
				)}
				{roles !== null ? (
					<Row key="Roles" label="Roles" subLabel={String(roles)} />
				) : null}
				{channels !== null ? (
					<Row key="Channels" label="Channels" subLabel={String(channels)} />
				) : null}
				<Row
					key="Boost"
					label="Boost status"
					subLabel={`Level ${guild.premiumTier || 0} (${guild.premiumSubscriberCount || 0} boosts)`}
				/>
			</Design.TableRowGroup>
			<Design.TableRowGroup title={DETAILS}>
				{ownerId ? (
					<Row
						key="Owner"
						label="Owner"
						subLabel={ownerName}
						icon={
							<Image
								source={{ uri: avatarUrl(ownerId, ownerAvatar) }}
								style={{ width: 24, height: 24, borderRadius: 12 }}
							/>
						}
						trailing={chevron()}
						onPress={() => openProfile(ownerId, guildId)}
					/>
				) : null}
				{vanity ? (
					<Row key="Vanity" label="Vanity URL" subLabel={vanity} />
				) : null}
				<Row key="Created" label="Created on" subLabel={createdOn(guildId)} />
				<Row
					key="Id"
					label="Server ID"
					subLabel={guildId}
					onPress={() => {
						try {
							Clipboard.setString(String(guildId))
							toast('Server ID copied')
						} catch {
							// Nothing was copied, so nothing is announced.
						}
					}}
				/>
			</Design.TableRowGroup>
			<Design.Button
				text={CLOSE}
				variant="secondary"
				onPress={() => sheets().hideActionSheet(SHEET_KEY)}
			/>
		</ActionSheetBody>
	)
}
