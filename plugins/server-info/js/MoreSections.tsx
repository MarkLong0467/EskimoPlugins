import { View } from 'react-native'
import { copy, store } from './discord'
import {
	AGE_RATING,
	afkAfter,
	assetUrl,
	EXPLICIT_FILTER,
	featureNames,
	formatNumber,
	NOTIFICATIONS,
} from './format'
import { Card, Glyph, Line, Pill, SectionTitle } from './parts'
import type { ReactNode } from 'react'
import type { ChannelCounts } from './channels'
import type { ChannelById, Guild } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const CHANNELS = 'Channels'
const SETTINGS = 'Safety and settings'
const FEATURES = 'Features'
const LINKS = 'Links'
const MORE = 'more'
const LINK_COPIED = 'Link copied'
const TAP_TO_COPY = 'Tap to copy the link'

/** The most features listed before the rest is counted. */
const FEATURES_SHOWN = 24

/** One row of a group. */
interface Row {
	title: string
	text: string
	icon: ReactNode
	/** What tapping it copies, when it can be copied. */
	copy?: string
}

/** A titled card of rows. Nothing when there are no rows. */
function Group({ title, rows }: { title: string; rows: Row[] }) {
	if (rows.length === 0) return null
	return (
		<>
			<SectionTitle text={title} />
			<Card>
				{rows.map((row, index) => (
					<Line
						key={row.title}
						divider={index > 0}
						icon={row.icon}
						title={row.title}
						text={row.text}
						end={
							row.copy ? <Glyph names={['CopyIcon']} fallback="⧉" /> : undefined
						}
						onPress={
							row.copy ? () => copy(row.copy ?? '', LINK_COPIED) : undefined
						}
					/>
				))}
			</Card>
		</>
	)
}

/** The count of something, or nothing when there is none, so the group only lists what the server has. */
function counted(
	title: string,
	value: number | undefined,
	fallback: string,
): Row | null {
	if (!value) return null
	return {
		title,
		text: String(formatNumber(value)),
		icon: <Glyph names={[]} fallback={fallback} />,
	}
}

/**
 * The rest of what the server says about itself, under the details: its channels by kind and the special ones (rules, system
 * messages, inactive), its safety settings, its features and links to its pictures.
 */
export default function MoreSections({
	guild,
	guildId,
	channels,
}: {
	guild: Guild
	guildId: string
	channels: ChannelCounts | null
}) {
	const names = store<ChannelById>('ChannelStore')
	const channelName = (id: string | null | undefined): string | null => {
		if (!id) return null
		const name = names?.getChannel?.(id)?.name
		return name ? `#${name}` : null
	}

	const channelRows = [
		counted('Categories', channels?.categories, '▤'),
		counted('Announcement channels', channels?.announcements, '📢'),
		counted('Forum channels', channels?.forums, '💬'),
		counted('Stage channels', channels?.stages, '🎙'),
	].filter((row): row is Row => row !== null)
	const rules = channelName(guild.rulesChannelId)
	if (rules)
		channelRows.push({
			title: 'Rules channel',
			text: rules,
			icon: <Glyph names={[]} fallback="📜" />,
		})
	const system = channelName(guild.systemChannelId)
	if (system)
		channelRows.push({
			title: 'System messages',
			text: system,
			icon: <Glyph names={[]} fallback="🔔" />,
		})
	const afk = channelName(guild.afkChannelId)
	if (afk)
		channelRows.push({
			title: 'Inactive voice channel',
			text: guild.afkTimeout
				? `${afk} · after ${afkAfter(guild.afkTimeout)}`
				: afk,
			icon: <Glyph names={[]} fallback="💤" />,
		})

	const settingRows: Row[] = []
	if (guild.explicitContentFilter !== undefined)
		settingRows.push({
			title: 'Explicit media filter',
			text:
				EXPLICIT_FILTER[guild.explicitContentFilter] ??
				String(guild.explicitContentFilter),
			icon: <Glyph names={['EyeIcon', 'ShieldIcon']} fallback="👁" />,
		})
	if (guild.defaultMessageNotifications !== undefined)
		settingRows.push({
			title: 'Default notifications',
			text:
				NOTIFICATIONS[guild.defaultMessageNotifications] ??
				String(guild.defaultMessageNotifications),
			icon: <Glyph names={['BellIcon']} fallback="🔔" />,
		})
	if (guild.mfaLevel !== undefined)
		settingRows.push({
			title: 'Moderators need 2FA',
			text: guild.mfaLevel ? 'Yes' : 'No',
			icon: <Glyph names={['ShieldLockIcon', 'ShieldIcon']} fallback="🔐" />,
		})
	if (guild.nsfwLevel)
		settingRows.push({
			title: 'Age rating',
			text: AGE_RATING[guild.nsfwLevel] ?? String(guild.nsfwLevel),
			icon: <Glyph names={['WarningIcon']} fallback="⚠" />,
		})
	if (guild.maxMembers && guild.maxMembers > 0)
		settingRows.push({
			title: 'Member limit',
			text: String(formatNumber(guild.maxMembers)),
			icon: <Glyph names={['FriendsIcon', 'UserIcon']} fallback="👥" />,
		})

	const featureList = featureNames(guild.features)
	const shown = featureList.slice(0, FEATURES_SHOWN)

	const linkRows: Row[] = []
	const picture = (
		title: string,
		kind: 'icons' | 'banners' | 'splashes',
		hash: string | null | undefined,
	) => {
		if (!hash) return
		linkRows.push({
			title,
			text: TAP_TO_COPY,
			icon: <Glyph names={['ImageIcon']} fallback="🖼" />,
			copy: assetUrl(kind, guildId, hash, 1024),
		})
	}
	picture('Server icon', 'icons', guild.icon)
	picture('Banner', 'banners', guild.banner)
	picture('Invite background', 'splashes', guild.splash)

	return (
		<>
			<Group title={CHANNELS} rows={channelRows} />
			<Group title={SETTINGS} rows={settingRows} />
			{shown.length > 0 ? (
				<>
					<SectionTitle text={FEATURES} />
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
						{shown.map(name => (
							<Pill key={name} text={name} />
						))}
						{featureList.length > shown.length ? (
							<Pill text={`+${featureList.length - shown.length} ${MORE}`} />
						) : null}
					</View>
				</>
			) : null}
			<Group title={LINKS} rows={linkRows} />
		</>
	)
}
