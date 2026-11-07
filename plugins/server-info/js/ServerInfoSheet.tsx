import { Dispatcher } from '@valenced/discord/common/flux'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Image, Pressable, View } from 'react-native'
import ActionSheetBody from './ActionSheetBody'
import { chevron } from './Chevron'
import { countChannels } from './channels'
import { DISCORD_EPOCH, FRIENDS_KEY, SHEET_KEY } from './constants'
import {
	apiGet,
	copy,
	fetchUser,
	findByProps,
	openProfile,
	sheets,
	store,
} from './discord'
import FriendsSheet from './FriendsSheet'
import {
	ago,
	assetUrl,
	avatarUrl,
	boostCard,
	formatNumber,
	languageName,
	longDate,
	snowflake,
	VERIFICATION,
} from './format'
import { getGuildFriends } from './friends'
import MoreSections from './MoreSections'
import { fetchOnline } from './online'
import {
	Card,
	color,
	Dot,
	Glyph,
	Line,
	Pill,
	ProgressBar,
	SectionTitle,
	SURFACE,
	SURFACE_HIGHEST,
	Tile,
} from './parts'
import { ownerCache } from './state'
import type {
	ChangeStore,
	ChannelStore,
	CountStore,
	EmojiStore,
	Friend,
	GuildStore,
	MemberStore,
	PresenceStore,
	RoleStore,
	StickersStore,
	UserStore,
} from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const TITLE = 'Server info'
const LOADING = 'Loading...'
const FRIENDS = 'Friends'
const OWNER = 'Owner'
const DETAILS = 'Details'
const NO_FRIENDS = 'None of your friends are here'
const COMMUNITY = 'Community'
const VERIFIED = 'Verified'
const PARTNERED = 'Partnered'
const CHANNELS = 'Channels'
const ROLES = 'Roles'
const EMOJIS = 'Emojis'
const STICKERS = 'Stickers'
const CREATED = 'Created'
const JOINED = 'You joined'
const VERIFICATION_TITLE = 'Verification'
const LANGUAGE = 'Language'
const SERVER_ID = 'Server ID'
const VANITY = 'Vanity URL'
const CROWN = '👑'

/** The colours of the dot on an avatar, by status. */
const STATUS_COLOURS: Record<string, string> = {
	online: '#23a55a',
	idle: '#f0b232',
	dnd: '#f23f43',
	streaming: '#593695',
	offline: '#80848e',
	invisible: '#80848e',
}

/** Whether a server has a feature. Discord keeps them in a Set, and a list is read too. */
function hasFeature(
	features: Set<string> | string[] | undefined,
	name: string,
): boolean {
	if (!features) return false
	return features instanceof Set ? features.has(name) : features.includes(name)
}

/** A moment from a date, a number of milliseconds or the text Discord saves, or nothing. */
function momentOf(value: Date | number | string | null | undefined) {
	if (value == null) return null
	const ms = new Date(value).getTime()
	return Number.isFinite(ms) ? ms : null
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

/** A round picture, with a small dot for the status when there is one. */
function Avatar({
	uri,
	size,
	status,
}: {
	uri: string
	size: number
	status?: string
}) {
	return (
		<View style={{ width: size, height: size }}>
			<Image
				source={{ uri }}
				style={{
					width: size,
					height: size,
					borderRadius: size / 2,
					backgroundColor: color('BACKGROUND_SURFACE_HIGHEST', SURFACE_HIGHEST),
				}}
			/>
			{status ? (
				<View
					accessibilityLabel={`Status: ${status}`}
					style={{
						position: 'absolute',
						right: -2,
						bottom: -2,
						width: size * 0.34,
						height: size * 0.34,
						borderRadius: size * 0.17,
						backgroundColor: STATUS_COLOURS[status] ?? STATUS_COLOURS.offline,
						borderWidth: 3,
						borderColor: color('BACKGROUND_SURFACE_HIGH', SURFACE),
					}}
				/>
			) : null}
		</View>
	)
}

/**
 * The Server Info sheet: the server's picture, name and badges, how many channels, roles, emojis and stickers it has, its
 * boosts, your friends in it, its owner, and details such as when it was made and when you joined.
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
	const Presence = store<PresenceStore>('PresenceStore')
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
			Presence,
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
	const [ownerHandle, setOwnerHandle] = useState<string | null>(
		cached?.username || null,
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
			setOwnerHandle(known.username)
			setOwnerAvatar(known.avatar || null)
			ownerCache.set(guildId, {
				id: ownerId,
				name,
				username: known.username,
				avatar: known.avatar || null,
			})
			return
		}
		let cancelled = false
		fetchUser(ownerId, guildId).then(
			user => {
				if (cancelled) return
				const name = user.global_name || user.username || null
				try {
					Dispatcher.dispatch({ type: 'USER_UPDATE', user } as never)
				} catch {
					// The name is still shown from the lookup.
				}
				setOwnerName(name)
				setOwnerHandle(user.username || null)
				setOwnerAvatar(user.avatar || null)
				ownerCache.set(guildId, {
					id: ownerId,
					name,
					username: user.username || null,
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

	const close = () => sheets().hideActionSheet(SHEET_KEY)
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
		? countChannels(GuildChannelStore.getChannels(guildId))
		: null
	const emojiList = store<EmojiStore>('EmojiStore')?.getGuildEmoji?.(guildId)
	const emojis = Array.isArray(emojiList) ? emojiList.length : null
	const stickerList =
		store<StickersStore>('StickersStore')?.getStickersByGuildId?.(guildId)
	const stickers = Array.isArray(stickerList) ? stickerList.length : null

	const ownerMember = ownerId
		? GuildMemberStore?.getMember?.(guildId, ownerId)
		: null
	const ownerName =
		ownerMember?.nick ||
		ownerNameState ||
		(ownerId ? `User (${String(ownerId).slice(0, 6)})` : LOADING)
	const handleText = ownerHandle ? `@${ownerHandle}` : ''
	const ownerStatus = ownerId ? Presence?.getStatus?.(ownerId) : undefined
	const vanity = guild.vanityURLCode
		? `discord.gg/${guild.vanityURLCode}`
		: null

	const made = snowflake(guildId) + DISCORD_EPOCH
	const joined = momentOf(
		GuildMemberStore?.getSelfMemberJoinedAt?.(guildId) ??
			GuildMemberStore?.getSelfMember?.(guildId)?.joinedAt,
	)
	const boost = boostCard(
		guild.premiumTier || 0,
		guild.premiumSubscriberCount || 0,
	)
	const level = guild.verificationLevel ?? 0
	const surface = color('BACKGROUND_SURFACE_HIGH', SURFACE)

	const memberLine =
		rawMembers == null
			? null
			: `${formatNumber(rawMembers)} member${rawMembers === 1 ? '' : 's'}`
	const onlineLine =
		rawOnline == null || typeof rawOnline === 'string'
			? null
			: `${formatNumber(rawOnline)} online`

	return (
		<ActionSheetBody title={TITLE} onClose={close}>
			{bannerUrl ? (
				<Image
					source={{ uri: bannerUrl }}
					style={{ width: '100%', height: 120, borderRadius: 16 }}
					resizeMode="cover"
				/>
			) : null}

			<View style={{ gap: 12 }}>
				{iconUrl ? (
					<Image
						source={{ uri: iconUrl }}
						style={{ width: 88, height: 88, borderRadius: 22 }}
					/>
				) : (
					<View
						style={{
							width: 88,
							height: 88,
							borderRadius: 22,
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: surface,
						}}
					>
						<Design.Text variant="heading-xl/bold">
							{String(guild.name || '').slice(0, 2)}
						</Design.Text>
					</View>
				)}
				<Design.Text variant="heading-xl/bold" numberOfLines={3}>
					{guild.name}
				</Design.Text>
				{guild.description ? (
					<Design.Text variant="text-md/medium" color="text-muted">
						{guild.description}
					</Design.Text>
				) : null}
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
					{hasFeature(guild.features, 'COMMUNITY') ? (
						<Pill
							text={COMMUNITY}
							icon={
								<Glyph
									names={['CircleCheckIcon', 'CheckmarkLargeIcon']}
									fallback="✓"
								/>
							}
						/>
					) : null}
					{hasFeature(guild.features, 'VERIFIED') ? (
						<Pill text={VERIFIED} />
					) : null}
					{hasFeature(guild.features, 'PARTNERED') ? (
						<Pill text={PARTNERED} />
					) : null}
				</View>
				<View
					style={{
						flexDirection: 'row',
						flexWrap: 'wrap',
						alignItems: 'center',
						gap: 14,
					}}
				>
					{onlineLine ? (
						<View
							accessibilityLabel={onlineLine}
							style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
						>
							<Dot fill="#23a55a" />
							<Design.Text variant="text-lg/medium" color="text-muted">
								{onlineLine}
							</Design.Text>
						</View>
					) : null}
					<View
						accessibilityLabel={memberLine ?? LOADING}
						style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
					>
						<Dot fill="#80848e" />
						<Design.Text variant="text-lg/medium" color="text-muted">
							{memberLine ?? LOADING}
						</Design.Text>
					</View>
				</View>
			</View>

			<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
				{channels ? (
					<Tile
						icon={
							<Glyph
								names={['HashSmallIcon', 'PoundIcon', 'HashIcon']}
								fallback="#"
							/>
						}
						value={String(formatNumber(channels.total))}
						label={CHANNELS}
						detail={
							channels.text !== undefined
								? `${channels.text} text, ${channels.voice ?? 0} voice`
								: undefined
						}
					/>
				) : null}
				{roles !== null ? (
					<Tile
						icon={
							<Glyph names={['ShieldUserIcon', 'ShieldIcon']} fallback="🛡" />
						}
						value={String(formatNumber(roles))}
						label={ROLES}
					/>
				) : null}
				{emojis !== null ? (
					<Tile
						icon={
							<Glyph names={['ReactionIcon', 'FaceSmileIcon']} fallback="🙂" />
						}
						value={String(formatNumber(emojis))}
						label={EMOJIS}
					/>
				) : null}
				{stickers !== null ? (
					<Tile
						icon={<Glyph names={['StickerIcon']} fallback="🏷" />}
						value={String(formatNumber(stickers))}
						label={STICKERS}
					/>
				) : null}
			</View>

			<Card style={{ padding: 18, gap: 14 }}>
				<View
					accessibilityLabel={`${boost.title}, ${boost.count}`}
					style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}
				>
					<View style={{ width: 28, alignItems: 'center' }}>
						<Glyph
							names={['BoostGemOutlineIcon', 'BoostGemIcon', 'NitroWheelIcon']}
							fallback="◆"
						/>
					</View>
					<View style={{ flex: 1 }}>
						<Design.Text variant="text-lg/semibold">{boost.title}</Design.Text>
						<Design.Text variant="text-md/medium" color="text-muted">
							{boost.count}
						</Design.Text>
					</View>
				</View>
				<ProgressBar fraction={boost.fraction} />
				<Design.Text variant="text-md/medium" color="text-muted">
					{boost.hint}
				</Design.Text>
			</Card>

			<SectionTitle text={FRIENDS} />
			<Card>
				{friendsLoading ? (
					<Line
						icon={<Glyph names={['FriendsIcon', 'UserIcon']} fallback="👤" />}
						title={LOADING}
						label="Friends: loading"
					/>
				) : friends.length === 0 ? (
					<Line
						icon={<Glyph names={['FriendsIcon', 'UserIcon']} fallback="👤" />}
						title={NO_FRIENDS}
						label="Friends: none"
					/>
				) : (
					<Line
						icon={<Glyph names={['FriendsIcon', 'UserIcon']} fallback="👤" />}
						title={`${friends.length} of your friends ${friends.length === 1 ? 'is' : 'are'} here`}
						label={`Friends: ${friends.length}`}
						end={
							<View
								style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
							>
								<View style={{ flexDirection: 'row' }}>
									{friends.slice(0, 4).map((friend, index) => (
										<View
											key={friend.id}
											style={{ marginLeft: index === 0 ? 0 : -10 }}
										>
											<Avatar
												uri={avatarUrl(
													friend.id,
													UserStore?.getUser(friend.id)?.avatar,
												)}
												size={30}
											/>
										</View>
									))}
								</View>
								{chevron()}
							</View>
						}
						onPress={() => openFriends(friends, guildId)}
					/>
				)}
			</Card>

			{ownerId ? (
				<>
					<SectionTitle text={OWNER} />
					<Card>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={`Owner: ${ownerName}`}
							onPress={() => openProfile(ownerId, guildId)}
						>
							<View
								style={{
									flexDirection: 'row',
									alignItems: 'center',
									gap: 14,
									padding: 16,
								}}
							>
								<Avatar
									uri={avatarUrl(ownerId, ownerAvatar)}
									size={52}
									status={ownerStatus}
								/>
								<View style={{ flex: 1 }}>
									<Design.Text variant="text-lg/semibold" numberOfLines={1}>
										{ownerName}
									</Design.Text>
									{ownerHandle ? (
										<Design.Text
											variant="text-md/medium"
											color="text-muted"
											numberOfLines={1}
										>
											{handleText}
										</Design.Text>
									) : null}
								</View>
								<Design.Text variant="heading-lg/bold">{CROWN}</Design.Text>
								{chevron()}
							</View>
						</Pressable>
					</Card>
				</>
			) : null}

			<SectionTitle text={DETAILS} />
			<Card>
				<Line
					icon={<Glyph names={['CalendarIcon']} fallback="📅" />}
					title={CREATED}
					text={`${longDate(made)} · ${ago(made)}`}
				/>
				{joined !== null ? (
					<Line
						divider
						icon={
							<Glyph names={['UserPlusIcon', 'CirclePlusIcon']} fallback="➕" />
						}
						title={JOINED}
						text={`${longDate(joined)} · ${ago(joined)}`}
					/>
				) : null}
				<Line
					divider
					icon={<Glyph names={['ShieldIcon', 'ShieldLockIcon']} fallback="🛡" />}
					title={VERIFICATION_TITLE}
					text={VERIFICATION[level] ?? String(level)}
				/>
				<Line
					divider
					icon={
						<Glyph names={['GlobeEarthIcon', 'LanguageIcon']} fallback="🌐" />
					}
					title={LANGUAGE}
					text={languageName(guild.preferredLocale)}
				/>
				{vanity ? (
					<Line
						divider
						icon={
							<Glyph names={['LinkIcon', 'LinkExternalIcon']} fallback="🔗" />
						}
						title={VANITY}
						text={vanity}
						end={<Glyph names={['CopyIcon']} fallback="⧉" />}
						onPress={() => copy(`https://${vanity}`, 'Link copied')}
					/>
				) : null}
				<Line
					divider
					icon={<Glyph names={['IdIcon', 'IdCardIcon']} fallback="ID" />}
					title={SERVER_ID}
					text={guildId}
					end={<Glyph names={['CopyIcon']} fallback="⧉" />}
					onPress={() => copy(String(guildId), 'Server ID copied')}
				/>
			</Card>
			<MoreSections guild={guild} guildId={guildId} channels={channels} />
		</ActionSheetBody>
	)
}
