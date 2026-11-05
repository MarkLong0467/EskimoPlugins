import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Image, View } from 'react-native'
import { ORANGE } from './constants'
import { checkedAgo, fmt } from './format'
import { buttonOf, coverOf, effective } from './present'
import { listenToStatus, state } from './state'
import type { SoundCloudSettings } from './types'

/** The styles are made the first time the preview is drawn (they need Discord's color tokens), then kept. */
let previewStyles: (() => Record<string, object>) | undefined

/** One line of text in the preview, or nothing if it is empty. */
function Line({
	content,
	variant,
	color,
}: {
	content: string | undefined
	variant: string
	color?: string
}) {
	return content ? (
		<Design.Text variant={variant as never} color={color as never}>
			{content}
		</Design.Text>
	) : null
}

/** Texts as constants because React Native text must be passed as an expression. */
const NO_TRACK_MANUAL =
	'Nothing is shown yet. Paste a SoundCloud link below to put a track on your profile.'
const OFF_NOTE = 'Show status is off, so nothing is on your profile.'

/**
 * The live preview at the top of the settings: how the status will look (what it says after "Listening to", the title,
 * the artist, the progress bar or elapsed time, the cover and the button), where the track came from, and any problem
 * (an error, a track that ended, or the status hidden because Spotify is showing). It draws itself again when the status
 * or the checks of Last.fm change.
 */
export default function Preview({
	settings: s,
}: {
	settings: SoundCloudSettings
}) {
	if (!previewStyles) {
		const colors = (
			Tokens as unknown as { default: { colors: Record<string, string> } }
		).default.colors
		previewStyles = Design.createStyles({
			band: {
				backgroundColor: colors.BACKGROUND_SURFACE_HIGH,
				paddingHorizontal: 16,
				paddingVertical: 12,
			},
			row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
			accent: {
				width: 4,
				alignSelf: 'stretch',
				borderRadius: 2,
				marginRight: 12,
				backgroundColor: ORANGE,
			},
			art: {
				width: 64,
				height: 64,
				borderRadius: 8,
				marginRight: 12,
				overflow: 'hidden',
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: colors.BACKGROUND_SURFACE_HIGHEST,
			},
			artImage: { width: 64, height: 64 },
			text: { flex: 1 },
			bar: {
				height: 4,
				borderRadius: 2,
				marginTop: 6,
				backgroundColor: colors.BACKGROUND_SURFACE_HIGHEST,
				overflow: 'hidden',
			},
			barFill: { width: '35%', height: 4, backgroundColor: ORANGE },
			button: {
				alignSelf: 'flex-start',
				marginTop: 10,
				paddingHorizontal: 12,
				paddingVertical: 6,
				borderRadius: 6,
				backgroundColor: colors.BACKGROUND_SURFACE_HIGHEST,
			},
		}) as unknown as typeof previewStyles
	}
	const st = previewStyles?.() as Record<string, object>

	const [, setTick] = useState(0)
	useEffect(() => listenToStatus(() => setTick(n => n + 1)), [])

	const t = effective(s)
	const fromAuto = !!(s.autoEnabled && state.auto)
	const status = state.status

	let body: React.ReactNode
	if (!t) {
		const nothing = s.autoEnabled
			? `Nothing is playing. Last.fm is checked ${s.pollSeconds || 10} seconds apart.`
			: NO_TRACK_MANUAL
		body = (
			<Design.Text
				variant="text-sm/medium"
				color="text-muted"
				style={{ marginTop: 8 }}
			>
				{nothing}
			</Design.Text>
		)
	} else {
		const side =
			s.statusText === 1 && s.showArtist && t.artist
				? t.artist
				: s.statusText === 2
					? t.title
					: 'SoundCloud'
		const cover = coverOf(s, t)
		const timerLine =
			s.timerMode === 'progress' && t.duration > 0
				? null
				: s.timerMode === 'none'
					? undefined
					: s.timerMode === 'progress'
						? 'Length unknown, showing time elapsed'
						: '0:00 elapsed'
		body = (
			<View style={st.row}>
				<View style={st.accent} />
				{s.showArtwork ? (
					<View style={st.art}>
						{cover ? (
							<Image source={{ uri: cover }} style={st.artImage} />
						) : null}
					</View>
				) : null}
				<View style={st.text}>
					<Line
						content={`Listening to ${side}${fromAuto ? ` · automatic${checkedAgo()}` : ''}`}
						variant="text-xs/semibold"
						color="text-muted"
					/>
					<Line content={t.title} variant="text-md/semibold" />
					{s.showArtist ? (
						<Line content={t.artist} variant="text-sm/medium" />
					) : null}
					{timerLine === null ? (
						<View>
							<View style={st.bar}>
								<View style={st.barFill} />
							</View>
							<Line
								content={`0:00 / ${fmt(t.duration)}`}
								variant="text-xs/medium"
								color="text-muted"
							/>
						</View>
					) : (
						<Line
							content={timerLine}
							variant="text-xs/medium"
							color="text-muted"
						/>
					)}
				</View>
			</View>
		)
	}

	const heading = `LIVE PREVIEW${s.output === 'rich' ? ' · SHOWN BY RICH PRESENCE' : ''}`
	return (
		<View style={st.band}>
			<Design.Text variant="text-xs/semibold" color="text-muted">
				{heading}
			</Design.Text>
			{body}
			{t && s.showButton && s.output !== 'rich' ? (
				<View style={st.button}>
					<Design.Text variant="text-sm/semibold">
						{buttonOf(s, t).label}
					</Design.Text>
				</View>
			) : null}
			{status.state === 'loading' ? (
				<Design.Text
					variant="text-xs/medium"
					color="text-muted"
					style={{ marginTop: 8 }}
				>
					{status.text}
				</Design.Text>
			) : null}
			{status.state === 'error' ||
			status.state === 'ended' ||
			status.state === 'hidden' ? (
				<Design.Text
					variant="text-xs/medium"
					color={
						status.state === 'error' ? 'text-feedback-critical' : 'text-muted'
					}
					style={{ marginTop: 8 }}
				>
					{status.text}
				</Design.Text>
			) : null}
			{t && !s.enabled ? (
				<Design.Text
					variant="text-xs/medium"
					color="text-muted"
					style={{ marginTop: 8 }}
				>
					{OFF_NOTE}
				</Design.Text>
			) : null}
		</View>
	)
}
