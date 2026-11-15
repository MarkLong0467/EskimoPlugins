/**
 * A preview of the message as Discord shows it: the name and avatar, the text, the embeds with their colour, the poll
 * and the buttons. Markdown is shown as typed, with the words in braces filled in.
 */

import { Design } from '@valenced/discord/design'
import { Image, View } from 'react-native'
import { avatarUrl } from './api'
import { colorHex, colorNumber } from './payload'
import { fill } from './variables'
import type { Draft, Embed, Webhook } from './types'

const AVATAR = 40
const MUTED = 'text-muted'
const APP_TAG = 'APP'
const SILENT = 'silent'

/** What a link button says, with its emoji and the arrow Discord shows. */
const buttonText = (emoji: string, label: string) =>
	`${emoji ? `${emoji} ` : ''}${label} ↗`

function Pic({
	uri,
	size,
	round,
}: {
	uri: string
	size: number | [number, number]
	round?: boolean
}) {
	const [w, h] = Array.isArray(size) ? size : [size, size]
	return (
		<Image
			source={{ uri }}
			style={{ width: w, height: h, borderRadius: round ? w / 2 : 4 }}
			resizeMode="cover"
		/>
	)
}

/** One embed, with its colour bar on the left. */
function EmbedPreview({
	embed,
	put,
}: {
	embed: Embed
	put: (text: string) => string
}) {
	const color = colorNumber(embed.color)
	const bar = color === undefined ? '#4e5058' : colorHex(color)
	const rows: Embed['fields'][] = []
	for (const field of embed.fields) {
		const last = rows.at(-1)
		if (field.inline && last && last.length < 3 && last.every(f => f.inline))
			last.push(field)
		else rows.push([field])
	}
	const pictures = [
		embed.image,
		...(embed.url.trim() ? embed.gallery : []),
	].filter(p => p.trim())
	const time =
		embed.timestampMode === 'sent'
			? 'Today'
			: embed.timestampMode === 'fixed' && embed.timestamp
				? new Date(embed.timestamp).toLocaleString()
				: ''
	const footer = [put(embed.footerText), time].filter(Boolean).join(' • ')
	return (
		<View
			style={{
				flexDirection: 'row',
				borderRadius: 4,
				overflow: 'hidden',
				backgroundColor: 'rgba(128,128,128,0.12)',
				marginTop: 6,
			}}
		>
			<View style={{ width: 4, backgroundColor: bar }} />
			<View style={{ flex: 1, padding: 10, gap: 6 }}>
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<View style={{ flex: 1, gap: 6 }}>
						{embed.authorName ? (
							<View
								style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
							>
								{embed.authorIcon ? (
									<Pic uri={embed.authorIcon} size={20} round />
								) : null}
								<Design.Text variant="text-sm/semibold">
									{put(embed.authorName)}
								</Design.Text>
							</View>
						) : null}
						{embed.title ? (
							<Design.Text
								variant="text-md/semibold"
								color={embed.url ? 'text-link' : undefined}
							>
								{put(embed.title)}
							</Design.Text>
						) : null}
						{embed.description ? (
							<Design.Text variant="text-sm/normal">
								{put(embed.description)}
							</Design.Text>
						) : null}
						{rows.map((row, r) => (
							<View key={`row-${r}`} style={{ flexDirection: 'row', gap: 8 }}>
								{row.map((field, i) => (
									<View key={`field-${r}-${i}`} style={{ flex: 1 }}>
										<Design.Text variant="text-sm/semibold">
											{put(field.name)}
										</Design.Text>
										<Design.Text variant="text-sm/normal">
											{put(field.value)}
										</Design.Text>
									</View>
								))}
							</View>
						))}
					</View>
					{embed.thumbnail ? <Pic uri={embed.thumbnail} size={64} /> : null}
				</View>
				{pictures.length ? (
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
						{pictures.map((p, i) => (
							<Pic
								key={`pic-${i}`}
								uri={p}
								size={pictures.length === 1 ? [240, 160] : [118, 90]}
							/>
						))}
					</View>
				) : null}
				{footer ? (
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
						{embed.footerIcon ? (
							<Pic uri={embed.footerIcon} size={16} round />
						) : null}
						<Design.Text variant="text-xs/medium" color={MUTED}>
							{footer}
						</Design.Text>
					</View>
				) : null}
			</View>
		</View>
	)
}

/** The whole message. */
export function Preview({
	draft,
	webhook,
}: {
	draft: Draft
	webhook?: Webhook
}) {
	const put = (text: string) => fill(text, { webhook: webhook?.label })
	const pollLine = draft.poll
		? `${draft.poll.hours} h${draft.poll.multiselect ? ' · pick several' : ''}`
		: ''
	const name = put(draft.username) || webhook?.name || 'Webhook'
	const avatar =
		draft.avatarUrl ||
		(webhook
			? avatarUrl(webhook)
			: 'https://cdn.discordapp.com/embed/avatars/0.png')
	return (
		<View style={{ marginHorizontal: 16 }}>
			<Design.Card>
				<View style={{ flexDirection: 'row', gap: 10 }}>
					<Pic uri={avatar} size={AVATAR} round />
					<View style={{ flex: 1 }}>
						<View
							style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
						>
							<Design.Text variant="text-md/semibold">{name}</Design.Text>
							<View
								style={{
									backgroundColor: '#5865f2',
									borderRadius: 3,
									paddingHorizontal: 4,
								}}
							>
								<Design.Text
									variant="text-xxs/bold"
									style={{ color: '#ffffff' }}
								>
									{APP_TAG}
								</Design.Text>
							</View>
							{draft.silent ? (
								<Design.Text variant="text-xs/medium" color={MUTED}>
									{SILENT}
								</Design.Text>
							) : null}
						</View>
						{draft.content ? (
							<Design.Text variant="text-md/normal">
								{put(draft.content)}
							</Design.Text>
						) : null}
						{draft.embeds.map(e => (
							<EmbedPreview key={e.key} embed={e} put={put} />
						))}
						{draft.poll ? (
							<View
								style={{
									marginTop: 6,
									padding: 10,
									borderRadius: 6,
									backgroundColor: 'rgba(128,128,128,0.12)',
									gap: 6,
								}}
							>
								<Design.Text variant="text-md/semibold">
									{put(draft.poll.question) || 'Poll question'}
								</Design.Text>
								{draft.poll.answers
									.filter(a => a.trim())
									.map((a, i) => (
										<View
											key={`answer-${i}`}
											style={{
												padding: 8,
												borderRadius: 6,
												borderWidth: 1,
												borderColor: 'rgba(128,128,128,0.4)',
											}}
										>
											<Design.Text variant="text-sm/medium">
												{put(a)}
											</Design.Text>
										</View>
									))}
								<Design.Text variant="text-xs/medium" color={MUTED}>
									{pollLine}
								</Design.Text>
							</View>
						) : null}
						{draft.buttons.map((row, r) => (
							<View
								key={`buttons-${r}`}
								style={{
									flexDirection: 'row',
									flexWrap: 'wrap',
									gap: 6,
									marginTop: 6,
								}}
							>
								{row.map((b, i) => (
									<View
										key={`button-${r}-${i}`}
										style={{
											paddingHorizontal: 12,
											paddingVertical: 6,
											borderRadius: 6,
											backgroundColor: 'rgba(128,128,128,0.25)',
										}}
									>
										<Design.Text variant="text-sm/semibold">
											{buttonText(b.emoji, put(b.label))}
										</Design.Text>
									</View>
								))}
							</View>
						))}
					</View>
				</View>
			</Design.Card>
		</View>
	)
}
