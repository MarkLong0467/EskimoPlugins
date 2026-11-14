/**
 * The building blocks of the screens: labels, cards, finding cards and button rows.
 *
 * Everything is made of Discord's own design components (`Design.Text`, `Design.Card`, `Design.Button`, `Design.Stack`), so it
 * looks like the rest of the app on any theme. Colour is used only for the risk levels, as the colour of a word. Texts are
 * passed as expressions because React Native text must not be written between tags.
 */

import { Design } from '@valenced/discord/design'
import { NEUTRAL, RISK_COLOR } from './constants'
import { RISK_LABEL } from './scan'
import type { ReactNode } from 'react'
import type { Finding, LinkKind, Risk, Severity } from './types'

/** A short bold word in a colour, such as a risk level. */
export function Pill({
	text,
	solid,
	big,
}: {
	text: string
	solid: string
	big?: boolean
}) {
	return (
		<Design.Text
			variant={big ? 'text-md/bold' : 'text-xs/bold'}
			style={{ color: solid }}
		>
			{text}
		</Design.Text>
	)
}

/** The label of a risk level in its colour. */
export function RiskBadge({ risk, big }: { risk: Risk; big?: boolean }) {
	return (
		<Pill
			text={RISK_LABEL[risk].toUpperCase()}
			solid={RISK_COLOR[risk].solid}
			big={big}
		/>
	)
}

/** The label of a severity in its colour. */
export function SeverityBadge({ severity }: { severity: Severity }) {
	return <RiskBadge risk={severity} />
}

/** The label of a kind of link in its colour. */
export function KindBadge({ kind }: { kind: LinkKind }) {
	const map: Record<LinkKind, { text: string; solid: string }> = {
		risky: { text: 'RISKY', solid: RISK_COLOR.critical.solid },
		unknown: { text: 'UNKNOWN', solid: RISK_COLOR.medium.solid },
		known: { text: 'KNOWN', solid: RISK_COLOR.clean.solid },
		noise: { text: 'LIBRARY', solid: NEUTRAL.solid },
	}
	const m = map[kind]
	return <Pill text={m.text} solid={m.solid} />
}

/** A small muted label with no special meaning. */
export function Chip({ text }: { text: string }) {
	return (
		<Design.Text variant="text-xs/bold" color="text-muted">
			{text}
		</Design.Text>
	)
}

/** A line of small muted capitals above a group. */
export function Heading({ text }: { text: string }) {
	return (
		<Design.Text variant="eyebrow" color="text-muted">
			{text.toUpperCase()}
		</Design.Text>
	)
}

/** A card of Discord's design system. */
export function Panel({
	children,
	tint,
	style,
}: {
	children?: ReactNode
	tint?: string
	style?: Record<string, unknown>
}) {
	return (
		<Design.Card
			variant="secondary"
			border="subtle"
			style={{
				padding: 14,
				...(tint ? { backgroundColor: tint } : {}),
				...style,
			}}
		>
			{children}
		</Design.Card>
	)
}

/** Code shown in a card with a fixed-width font. */
export function Code({ text }: { text: string }) {
	return (
		<Design.Card variant="primary" border="faint" style={{ padding: 8 }}>
			<Design.Text
				variant="text-xs/medium"
				style={{ fontFamily: 'monospace' }}
				selectable
			>
				{text}
			</Design.Text>
		</Design.Card>
	)
}

/**
 * A finding: its severity, what it is, why it matters and where it matched.
 *
 * @param finding The finding.
 * @param dimmed Draw it faded, for a finding the user ignores.
 * @param actionText The label of the button under it, such as `Ignore`.
 * @param onAction What the button does.
 */
export function FindingCard({
	finding,
	dimmed,
	actionText,
	onAction,
}: {
	finding: Finding
	dimmed?: boolean
	actionText?: string
	onAction?: () => void
}) {
	const placesText = `${finding.count} places`
	return (
		<Panel style={{ gap: 6, opacity: dimmed ? 0.55 : 1 }}>
			<Design.Stack direction="horizontal" align="center" spacing={8}>
				<Design.Stack style={{ flex: 1, width: 'auto' }}>
					<Design.Text variant="text-md/semibold">{finding.title}</Design.Text>
				</Design.Stack>
				<SeverityBadge severity={finding.severity} />
			</Design.Stack>
			<Design.Text variant="text-sm/medium" color="text-muted">
				{finding.why}
			</Design.Text>
			{finding.samples.slice(0, 2).map((sample, i) => (
				<Code key={`${finding.rule}${i}`} text={sample} />
			))}
			{finding.count > 1 ? (
				<Design.Text variant="text-xs/medium" color="text-muted">
					{placesText}
				</Design.Text>
			) : null}
			{actionText && onAction ? (
				<Design.Button
					text={actionText}
					variant="tertiary"
					size="sm"
					onPress={onAction}
				/>
			) : null}
		</Panel>
	)
}

/** Buttons side by side, each taking an equal share. */
export function ButtonRow({ children }: { children: ReactNode }) {
	return (
		<Design.Stack direction="horizontal" spacing={10}>
			{children}
		</Design.Stack>
	)
}

/** One button of a {@link ButtonRow}. */
export function RowButton({
	text,
	variant,
	onPress,
	disabled,
}: {
	text: string
	variant: 'primary' | 'secondary' | 'tertiary' | 'destructive'
	onPress: () => void
	disabled?: boolean
}) {
	return (
		<Design.Stack style={{ flex: 1, width: 'auto' }}>
			<Design.Button
				text={text}
				variant={variant}
				size="sm"
				disabled={disabled}
				onPress={onPress}
			/>
		</Design.Stack>
	)
}
