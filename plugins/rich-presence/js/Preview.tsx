import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Image, View } from 'react-native'
import { loopLength } from './activity'
import { ORANGE, TYPES } from './constants'
import { checkedAgo, fmt } from './format'
import { buttonOf, coverOf, effective } from './present'
import { listenToSoundCloud, sc } from './scstate'
import { imageStatus, listenToStatus } from './state'
import {
	appStart,
	clockText,
	dailyWindow,
	durationText,
	MINUTE,
	nextMidnight,
	nextOccurrence,
	parseClock,
	parseDate,
	relativeText,
	startOfDay,
} from './timers'
import { num, partySize, text } from './variables'
import type { PreviewInfo, Profile, SoundCloudSettings } from './types'

/** The styles are made the first time the preview is drawn (they need Discord's color tokens), then kept. */
let previewStyles: (() => Record<string, object>) | undefined

/** The words for an activity type: `Playing`, `Listening to` and so on. */
const typeLabel = (type: unknown): string =>
	TYPES.filter(t => t.v === Number(type))[0]?.l ?? 'Playing'

/** Whether a text is a web link. */
const isLink = (value: string | undefined): value is string =>
	!!value && /^https?:\/\//i.test(value)

/** The timer of a profile in words, the way it reads right now (`2:05:10 left`), or nothing if it has none. */
export function timerLine(p: Profile, now = Date.now()): string | undefined {
	switch (p.timestampMode) {
		case 'elapsed':
			return '0:00 elapsed'
		case 'app':
			return `${durationText(now - appStart())} elapsed since Discord opened`
		case 'clock':
			return `${durationText(now - startOfDay(now)).replace(/:\d\d$/, '')} elapsed today`
		case 'since': {
			const date = parseDate(p.timerDate)
			if (date === undefined) return undefined
			return date <= now
				? `${durationText(now - date)} elapsed`
				: `starts ${relativeText(date, now)}`
		}
		case 'until': {
			const date = parseDate(p.timerDate)
			if (date === undefined) return undefined
			const next = nextOccurrence(date, p.timerRepeat, now)
			return next === undefined
				? 'that date has passed'
				: `${durationText(next - now)} left`
		}
		case 'countdown': {
			const minutes = num(p.countdownMinutes) || 0
			if (!minutes) return undefined
			return `${durationText(minutes * MINUTE)} left${loopLength(p) ? ', then starts over' : ''}`
		}
		case 'midnight':
			return `${durationText(nextMidnight(now) - now)} left today`
		case 'daily': {
			const from = parseClock(p.dailyFrom)
			const to = parseClock(p.dailyTo)
			if (from === undefined || to === undefined) return undefined
			const window = dailyWindow(from, to, now)
			return window.inside
				? `${durationText(window.end - now)} left (${clockText(from)} to ${clockText(to)})`
				: `starts ${relativeText(window.start, now)}`
		}
		case 'custom': {
			const a = parseDate(p.customStart)
			const b = parseDate(p.customEnd)
			if (a !== undefined && b !== undefined && b > a)
				return `${durationText(b - a)}, starts over when it ends`
			return a !== undefined || b !== undefined ? 'your own timer' : undefined
		}
		case 'external':
			return 'follows the SoundCloud track'
		default:
			return undefined
	}
}

/**
 * What the presence will say, from a profile that may include text still being typed.
 * Variables are filled in, the party size is added to the state line, and the timer is described in words.
 */
export function describe(p: Profile): PreviewInfo {
	const name = text(p.name)
	let state = text(p.state)
	const cur = partySize(p.partyCurrent)
	const max = partySize(p.partyMax)
	if (state && cur !== undefined && max !== undefined)
		state += ` (${Math.min(cur, max)} of ${max})`

	const timer = timerLine(p)

	const buttons: string[] = []
	for (const [labelField, urlField] of [
		[p.button1Label, p.button1Url],
		[p.button2Label, p.button2Url],
	]) {
		const label = text(labelField)
		if (label && isLink(text(urlField))) buttons.push(label)
	}

	const image = text(p.largeImage)
	const small = text(p.smallImage)
	return {
		name,
		title: name ? `${typeLabel(p.type)} ${name}` : undefined,
		details: text(p.details),
		state,
		timer,
		buttons,
		image: isLink(image) ? image : undefined,
		hasImage: !!image,
		smallImage: isLink(small) ? small : undefined,
	}
}

/** The styles of every preview, made on first use. */
function styles(): Record<string, object> {
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
			row: { flexDirection: 'row', alignItems: 'center' },
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
			badge: {
				position: 'absolute',
				right: 6,
				bottom: 0,
				width: 24,
				height: 24,
				borderRadius: 12,
				overflow: 'hidden',
			},
			text: { flex: 1 },
			buttons: { flexDirection: 'row', marginTop: 8 },
			accent: {
				width: 4,
				alignSelf: 'stretch',
				borderRadius: 2,
				marginRight: 12,
				backgroundColor: ORANGE,
			},
			bar: {
				height: 4,
				borderRadius: 2,
				marginTop: 6,
				backgroundColor: colors.BACKGROUND_SURFACE_HIGHEST,
				overflow: 'hidden',
			},
			barFill: { width: '35%', height: 4, backgroundColor: ORANGE },
			scButton: {
				alignSelf: 'flex-start',
				marginTop: 10,
				paddingHorizontal: 12,
				paddingVertical: 6,
				borderRadius: 6,
				backgroundColor: colors.BACKGROUND_SURFACE_HIGHEST,
			},
			item: { marginTop: 6 },
			button: {
				paddingHorizontal: 10,
				paddingVertical: 4,
				borderRadius: 6,
				marginRight: 8,
				backgroundColor: colors.BACKGROUND_SURFACE_HIGHEST,
			},
		}) as unknown as typeof previewStyles
	}
	return previewStyles?.() as Record<string, object>
}

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
const HEADING = 'LIVE PREVIEW (THE PROFILE BEING EDITED)'
const NOTHING =
	'Nothing to show for this profile yet. Enter an Activity name, then switch the profile on under Showing now.'

/**
 * The live preview at the top of the settings: how the presence will look (title, lines, timer, pictures, buttons),
 * including text still being typed. If an image could not be sent, the reason is listed under it. It draws itself again
 * whenever an image's status changes.
 */
export default function Preview({
	info,
	profileId,
}: {
	info: PreviewInfo
	profileId: string
}) {
	const st = styles()

	const [, setTick] = useState(0)
	useEffect(() => listenToStatus(() => setTick(n => n + 1)), [])

	const problems = ['large', 'small']
		.filter(slot => {
			const status = imageStatus[`${profileId}:${slot}`]
			return status && status !== 'ok'
		})
		.map(
			slot =>
				`${slot === 'large' ? 'Large' : 'Small'} image not sent: ${imageStatus[`${profileId}:${slot}`]}`,
		)
	const problemText = problems.join('\n')

	return (
		<View style={st.band}>
			<Design.Text variant="text-xs/semibold" color="text-muted">
				{HEADING}
			</Design.Text>
			{info.name ? (
				<View style={[st.row, { marginTop: 8 }]}>
					<View>
						<View style={st.art}>
							{info.image ? (
								<Image source={{ uri: info.image }} style={st.artImage} />
							) : (
								<Design.Text variant="text-xs/medium" color="text-muted">
									{info.hasImage ? 'image' : ''}
								</Design.Text>
							)}
						</View>
						{info.smallImage ? (
							<View style={st.badge}>
								<Image
									source={{ uri: info.smallImage }}
									style={{ width: 24, height: 24 }}
								/>
							</View>
						) : null}
					</View>
					<View style={st.text}>
						<Line content={info.title} variant="text-md/semibold" />
						<Line content={info.details} variant="text-sm/medium" />
						<Line content={info.state} variant="text-sm/medium" />
						<Line
							content={info.timer}
							variant="text-sm/medium"
							color="text-muted"
						/>
					</View>
				</View>
			) : (
				<Design.Text variant="text-sm/medium" color="text-muted">
					{NOTHING}
				</Design.Text>
			)}
			{info.name && problems.length ? (
				<Design.Text
					variant="text-xs/medium"
					color="text-feedback-critical"
					style={{ marginTop: 8 }}
				>
					{problemText}
				</Design.Text>
			) : null}
			{info.name && info.buttons.length ? (
				<View style={st.buttons}>
					{info.buttons.map((label, i) => (
						<View key={`b${i}`} style={st.button}>
							<Design.Text variant="text-sm/semibold">{label}</Design.Text>
						</View>
					))}
				</View>
			) : null}
		</View>
	)
}

/** Texts as constants because React Native text must be passed as an expression. */
const NO_TRACK_MANUAL =
	'Nothing is shown yet. Paste a SoundCloud link below to put a track on your profile.'
const SC_HEADING = 'LIVE PREVIEW (SOUNDCLOUD)'
const SC_OFF =
	'Switch SoundCloud on from the list of presences to put it on your profile.'
const HOME_HEADING = 'LIVE PREVIEW (WHAT IS ON YOUR PROFILE)'
const HOME_NOTHING =
	'Nothing is on your profile. Switch a presence on below. A presence needs an Activity name, or for SoundCloud a track.'

/** Draws a preview again when the SoundCloud status or the checks of Last.fm change, or an image's status does. */
function useRedraw(): void {
	const [, setTick] = useState(0)
	useEffect(() => listenToSoundCloud(() => setTick(n => n + 1)), [])
	useEffect(() => listenToStatus(() => setTick(n => n + 1)), [])
}

/**
 * The preview at the top of the list of presences: one short block for each presence that is on your profile now.
 *
 * @param shown The profiles that are shown, in order.
 * @param settings The settings, for the SoundCloud track.
 */
export function HomePreview({
	shown,
	settings,
}: {
	shown: Profile[]
	settings: { soundcloud: SoundCloudSettings }
}) {
	const st = styles()
	useRedraw()
	return (
		<View style={st.band}>
			<Design.Text variant="text-xs/semibold" color="text-muted">
				{HOME_HEADING}
			</Design.Text>
			{shown.length ? (
				shown.map(p => {
					if (p.kind === 'soundcloud') {
						const track = effective(settings.soundcloud)
						return (
							<View key={p.id} style={st.item}>
								<Line
									content="Listening to SoundCloud"
									variant="text-sm/semibold"
								/>
								<Line
									content={
										track
											? `${track.title}${track.artist ? ` · ${track.artist}` : ''}`
											: ''
									}
									variant="text-sm/medium"
									color="text-muted"
								/>
							</View>
						)
					}
					const info = describe(p)
					return (
						<View key={p.id} style={st.item}>
							<Line content={info.title} variant="text-sm/semibold" />
							<Line
								content={[info.details, info.state].filter(Boolean).join(' · ')}
								variant="text-sm/medium"
								color="text-muted"
							/>
						</View>
					)
				})
			) : (
				<Design.Text
					variant="text-sm/medium"
					color="text-muted"
					style={{ marginTop: 8 }}
				>
					{HOME_NOTHING}
				</Design.Text>
			)}
		</View>
	)
}

/**
 * The preview of the SoundCloud presence: what it says after "Listening to", the title, the artist, the progress bar or
 * elapsed time, the cover and the button, where the track came from, and any problem (an error, a track that ended, or the
 * presence hidden because Spotify is showing).
 */
export function SoundCloudPreview({
	settings: s,
	on,
}: {
	settings: SoundCloudSettings
	on: boolean
}) {
	const st = styles()
	useRedraw()
	const t = effective(s)
	const fromAuto = !!(s.autoEnabled && sc.auto)
	const status = sc.status

	let body: React.ReactNode
	if (!t) {
		const nothing = s.autoEnabled
			? `Nothing is playing. Last.fm is checked every ${s.pollSeconds || 10} seconds.`
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
		const timer =
			s.timerMode === 'progress' && t.duration > 0
				? null
				: s.timerMode === 'none'
					? undefined
					: s.timerMode === 'progress'
						? 'Length unknown, showing time elapsed'
						: '0:00 elapsed'
		body = (
			<View style={[st.row, { marginTop: 8 }]}>
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
					{timer === null ? (
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
						<Line content={timer} variant="text-xs/medium" color="text-muted" />
					)}
				</View>
			</View>
		)
	}

	return (
		<View style={st.band}>
			<Design.Text variant="text-xs/semibold" color="text-muted">
				{SC_HEADING}
			</Design.Text>
			{body}
			{t && s.showButton ? (
				<View style={st.scButton}>
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
			{!on ? (
				<Design.Text
					variant="text-xs/medium"
					color="text-muted"
					style={{ marginTop: 8 }}
				>
					{SC_OFF}
				</Design.Text>
			) : null}
		</View>
	)
}
