/**
 * The building blocks of the sheets: cards, stat tiles, badges, the boost bar and icons.
 *
 * Colours come from Discord's own tokens, so the sheets follow the theme. Icons are Discord's own icons found by name; when
 * Discord has none by the names tried, a plain character is drawn in its place, so a tile never has a hole.
 */

import { Tokens } from '@valenced/discord/common/tokens'
import { Design } from '@valenced/discord/design'
import { Pressable, View } from 'react-native'
import { asset } from './discord'
import type { ReactNode } from 'react'

/** A colour from Discord's tokens, or the fallback when the token is missing. */
export function color(name: string, fallback: string): string {
	try {
		const colors = (
			Tokens as unknown as { default?: { colors?: Record<string, string> } }
		).default?.colors
		return colors?.[name] ?? fallback
	} catch {
		return fallback
	}
}

/** The first of Discord's icons, by name, that exists. */
export function iconId(names: readonly string[]): number | undefined {
	for (const name of names) {
		const id = asset(name)
		if (id != null) return id
	}
	return undefined
}

/** An icon, or the fallback character when Discord has no icon by those names. */
export function Glyph({
	names,
	fallback,
}: {
	names: readonly string[]
	fallback: string
}) {
	const id = iconId(names)
	if (id != null) return <Design.TableRow.Icon source={id} />
	return (
		<Design.Text variant="text-md/bold" color="text-muted">
			{fallback}
		</Design.Text>
	)
}

/** A rounded box on the sheet's raised surface. */
export function Card({
	children,
	style,
}: {
	children?: ReactNode
	style?: Record<string, unknown>
}) {
	return (
		<View
			style={{
				backgroundColor: color('BACKGROUND_SURFACE_HIGH', '#2b2d31'),
				borderRadius: 18,
				overflow: 'hidden',
				...style,
			}}
		>
			{children}
		</View>
	)
}

/** The small grey title above a group of cards. */
export function SectionTitle({ text }: { text: string }) {
	return (
		<Design.Text
			variant="text-md/medium"
			color="text-muted"
			style={{ marginTop: 6, marginLeft: 4 }}
		>
			{text}
		</Design.Text>
	)
}

/** One count with its icon and name, such as 63 channels. */
export function Tile({
	icon,
	value,
	label,
	detail,
}: {
	icon: ReactNode
	value: string
	label: string
	detail?: string
}) {
	return (
		<Card
			style={{
				flexGrow: 1,
				flexBasis: '30%',
				minWidth: 96,
				padding: 14,
				gap: 6,
			}}
		>
			<View accessibilityLabel={`${label}: ${value}`} style={{ gap: 6 }}>
				<View style={{ height: 24, alignItems: 'flex-start' }}>{icon}</View>
				<Design.Text variant="heading-xl/bold">{value}</Design.Text>
				<View>
					<Design.Text variant="text-md/medium" color="text-muted">
						{label}
					</Design.Text>
					{detail ? (
						<Design.Text variant="text-xs/medium" color="text-muted">
							{detail}
						</Design.Text>
					) : null}
				</View>
			</View>
		</Card>
	)
}

/** A small rounded badge, such as Community. */
export function Pill({ text, icon }: { text: string; icon?: ReactNode }) {
	return (
		<View
			accessibilityLabel={text}
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 6,
				alignSelf: 'flex-start',
				paddingVertical: 6,
				paddingHorizontal: 12,
				borderRadius: 999,
				backgroundColor: color('BACKGROUND_SURFACE_HIGH', '#2b2d31'),
			}}
		>
			{icon}
			<Design.Text variant="text-sm/semibold">{text}</Design.Text>
		</View>
	)
}

/** A small round dot, such as the one before the member count. */
export function Dot({ fill }: { fill: string }) {
	return (
		<View
			style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: fill }}
		/>
	)
}

/** The bar that shows how far a server is to its next boost level. */
export function ProgressBar({ fraction }: { fraction: number }) {
	const percent = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`
	return (
		<View
			accessibilityRole="progressbar"
			accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
			style={{
				height: 10,
				borderRadius: 5,
				overflow: 'hidden',
				backgroundColor: color('BACKGROUND_SURFACE_HIGHEST', '#3a3c42'),
			}}
		>
			<View
				style={{
					width: percent as `${number}%`,
					height: 10,
					borderRadius: 5,
					backgroundColor: '#ff73fa',
				}}
			/>
		</View>
	)
}

/** One row of a card: an icon, a name with a line under it, and something at the end. Tap it when it does something. */
export function Line({
	icon,
	title,
	text,
	end,
	label,
	onPress,
	divider,
}: {
	icon?: ReactNode
	title: string
	text?: string
	end?: ReactNode
	label?: string
	onPress?: () => void
	/** A thin line above the row. */
	divider?: boolean
}) {
	const body = (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 16,
				paddingVertical: 16,
				paddingHorizontal: 16,
			}}
		>
			{icon ? (
				<View style={{ width: 28, alignItems: 'center' }}>{icon}</View>
			) : null}
			<View style={{ flex: 1 }}>
				<Design.Text variant="text-lg/semibold">{title}</Design.Text>
				{text ? (
					<Design.Text variant="text-md/medium" color="text-muted">
						{text}
					</Design.Text>
				) : null}
			</View>
			{end}
		</View>
	)
	const inner = onPress ? (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label ?? title}
			onPress={onPress}
		>
			{body}
		</Pressable>
	) : (
		<View accessibilityLabel={label ?? title}>{body}</View>
	)
	return (
		<View>
			{divider ? (
				<View
					style={{
						height: 1,
						marginLeft: 60,
						backgroundColor: color('BORDER_SUBTLE', 'rgba(128,128,128,0.2)'),
					}}
				/>
			) : null}
			{inner}
		</View>
	)
}
