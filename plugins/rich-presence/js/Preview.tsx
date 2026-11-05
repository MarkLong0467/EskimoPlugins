import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Image, View } from 'react-native'
import { TYPES } from './constants'
import { imageStatus, listenToStatus } from './state'
import { num, pad, parseTime, text } from './variables'
import type { PreviewInfo, Profile } from './types'

/** The styles are made the first time the preview is drawn (they need Discord's color tokens), then kept. */
let previewStyles: (() => Record<string, object>) | undefined

/** The words for an activity type: `Playing`, `Listening to` and so on. */
const typeLabel = (type: unknown): string =>
	TYPES.filter(t => t.v === Number(type))[0]?.l ?? 'Playing'

/** Whether a text is a web link. */
const isLink = (value: string | undefined): value is string =>
	!!value && /^https?:\/\//i.test(value)

/**
 * What the presence will say, from a profile that may include text still being typed.
 * Variables are filled in, the party size is added to the state line, and the timer is described in words.
 */
export function describe(p: Profile): PreviewInfo {
	const name = text(p.name)
	let state = text(p.state)
	const cur = num(p.partyCurrent)
	const max = num(p.partyMax)
	if (state && cur !== undefined && max !== undefined && max > 0)
		state += ` (${Math.min(cur, max)} of ${max})`

	let timer: string | undefined
	const now = new Date()
	if (p.timestampMode === 'elapsed') timer = '0:00 elapsed'
	else if (p.timestampMode === 'clock')
		timer = `${pad(now.getHours())}:${pad(now.getMinutes())} elapsed`
	else if (p.timestampMode === 'countdown')
		timer = `${num(p.countdownMinutes) || 0}:00 left`
	else if (p.timestampMode === 'custom') {
		const a = parseTime(p.customStart)
		const b = parseTime(p.customEnd)
		timer =
			a !== undefined && b !== undefined && b > a
				? 'looping timer'
				: a !== undefined || b !== undefined
					? 'custom timer'
					: undefined
	}

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
const HEADING = 'LIVE PREVIEW'
const NOTHING =
	'Nothing is shown yet. Enter an Activity name to turn your presence on.'

/**
 * The live preview at the top of the settings: how the presence will look (title, lines, timer, pictures, buttons),
 * including text still being typed. If an image could not be sent, the reason is listed under it. It draws itself again
 * whenever an image's status changes.
 */
export default function Preview({ info }: { info: PreviewInfo }) {
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
			button: {
				paddingHorizontal: 10,
				paddingVertical: 4,
				borderRadius: 6,
				marginRight: 8,
				backgroundColor: colors.BACKGROUND_SURFACE_HIGHEST,
			},
		}) as unknown as typeof previewStyles
	}
	const st = previewStyles?.() as Record<string, object>

	const [, setTick] = useState(0)
	useEffect(() => listenToStatus(() => setTick(n => n + 1)), [])

	const problems = ['large', 'small']
		.filter(slot => imageStatus[slot] && imageStatus[slot] !== 'ok')
		.map(
			slot =>
				`${slot === 'large' ? 'Large' : 'Small'} image not sent: ${imageStatus[slot]}`,
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
