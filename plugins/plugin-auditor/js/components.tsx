/**
 * The building blocks of the screens: badges, tiles, the risk bar, tabs, progress and finding cards.
 *
 * Colours are fixed, with see-through backgrounds, so they read on a dark or a light theme. Texts are passed as
 * expressions because React Native text must not be written between tags.
 */

import { Design } from '@valenced/discord/design'
import { Text as NativeText, Pressable, View } from 'react-native'
import { NEUTRAL, RISK_COLOR, SURFACE } from './constants'
import { SEVERITIES } from './rules'
import { RISK_LABEL } from './scan'
import type { ReactNode } from 'react'
import type { Finding, LinkKind, Risk, Severity } from './types'

/** A small rounded label with a tinted background. */
export function Pill({
	text,
	solid,
	soft,
	big,
}: {
	text: string
	solid: string
	soft: string
	big?: boolean
}) {
	return (
		<View
			style={{
				backgroundColor: soft,
				borderRadius: 999,
				paddingHorizontal: big ? 12 : 8,
				paddingVertical: big ? 5 : 2,
				alignSelf: 'flex-start',
			}}
		>
			<NativeText
				style={{
					color: solid,
					fontSize: big ? 13 : 11,
					fontWeight: '700',
					letterSpacing: 0.3,
				}}
			>
				{text}
			</NativeText>
		</View>
	)
}

/** The label of a risk level in its colour. */
export function RiskBadge({ risk, big }: { risk: Risk; big?: boolean }) {
	const c = RISK_COLOR[risk]
	return (
		<Pill
			text={RISK_LABEL[risk].toUpperCase()}
			solid={c.solid}
			soft={c.soft}
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
	const map: Record<LinkKind, { text: string; solid: string; soft: string }> = {
		risky: { text: 'RISKY', ...RISK_COLOR.critical },
		unknown: { text: 'UNKNOWN', ...RISK_COLOR.medium },
		known: { text: 'KNOWN', ...RISK_COLOR.clean },
		noise: { text: 'LIBRARY', ...NEUTRAL },
	}
	const m = map[kind]
	return <Pill text={m.text} solid={m.solid} soft={m.soft} />
}

/** A small label with no special meaning. */
export function Chip({ text }: { text: string }) {
	return <Pill text={text} solid={NEUTRAL.solid} soft={NEUTRAL.soft} />
}

/** A rounded box on a raised surface. */
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
		<View
			style={{
				backgroundColor: tint ?? SURFACE,
				borderRadius: 16,
				padding: 14,
				...style,
			}}
		>
			{children}
		</View>
	)
}

/** One big number with a label under it. */
export function StatTile({
	value,
	label,
	color,
}: {
	value: string
	label: string
	color?: string
}) {
	return (
		<View
			style={{
				flex: 1,
				backgroundColor: SURFACE,
				borderRadius: 14,
				paddingVertical: 12,
				paddingHorizontal: 10,
				alignItems: 'center',
				gap: 2,
			}}
		>
			<NativeText
				style={{ fontSize: 24, fontWeight: '800', color: color ?? '#8A8F98' }}
			>
				{value}
			</NativeText>
			<Design.Text variant="text-xs/medium" color="text-muted">
				{label}
			</Design.Text>
		</View>
	)
}

/** A bar split into the risk levels, so the state of all plugins shows at a glance. */
export function RiskBar({ counts }: { counts: Record<Risk, number> }) {
	const order: Risk[] = [...SEVERITIES, 'clean']
	const total = order.reduce((sum, r) => sum + counts[r], 0)
	return (
		<View
			style={{
				flexDirection: 'row',
				height: 10,
				borderRadius: 5,
				overflow: 'hidden',
				backgroundColor: SURFACE,
			}}
		>
			{total > 0
				? order
						.filter(r => counts[r] > 0)
						.map(r => (
							<View
								key={r}
								style={{
									flex: counts[r],
									backgroundColor: RISK_COLOR[r].solid,
								}}
							/>
						))
				: null}
		</View>
	)
}

/** `3 high` for the legend. */
function legendText(counts: Record<Risk, number>, risk: Risk): string {
	return `${counts[risk]} ${RISK_LABEL[risk].toLowerCase()}`
}

/** A row of coloured counts under the risk bar. */
export function RiskLegend({ counts }: { counts: Record<Risk, number> }) {
	const order: Risk[] = [...SEVERITIES, 'clean']
	return (
		<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
			{order.map(r => (
				<View
					key={r}
					style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
				>
					<View
						style={{
							width: 8,
							height: 8,
							borderRadius: 4,
							backgroundColor: RISK_COLOR[r].solid,
						}}
					/>
					<Design.Text variant="text-xs/medium" color="text-muted">
						{legendText(counts, r)}
					</Design.Text>
				</View>
			))}
		</View>
	)
}

/** A thin bar that fills as work gets done. */
export function Progress({ done, total }: { done: number; total: number }) {
	const share = total > 0 ? Math.min(1, done / total) : 0
	return (
		<View
			style={{
				height: 6,
				borderRadius: 3,
				overflow: 'hidden',
				backgroundColor: SURFACE,
			}}
		>
			<View
				style={{
					width: `${Math.max(4, Math.round(share * 100))}%`,
					height: 6,
					borderRadius: 3,
					backgroundColor: RISK_COLOR.low.solid,
				}}
			/>
		</View>
	)
}

/** A row of tabs. The one that is open has a filled pill. */
export function Tabs<T extends string>({
	tabs,
	value,
	onChange,
}: {
	tabs: readonly { id: T; label: string; badge?: string }[]
	value: T
	onChange: (id: T) => void
}) {
	return (
		<View
			style={{
				flexDirection: 'row',
				backgroundColor: SURFACE,
				borderRadius: 14,
				padding: 4,
				gap: 4,
			}}
		>
			{tabs.map(tab => {
				const active = tab.id === value
				return (
					<Pressable
						key={tab.id}
						onPress={() => onChange(tab.id)}
						style={{
							flex: 1,
							alignItems: 'center',
							paddingVertical: 8,
							borderRadius: 11,
							backgroundColor: active ? RISK_COLOR.low.soft : 'transparent',
						}}
					>
						<NativeText
							style={{
								fontSize: 13,
								fontWeight: active ? '800' : '600',
								color: active ? RISK_COLOR.low.solid : NEUTRAL.solid,
							}}
							numberOfLines={1}
						>
							{tab.badge ? `${tab.label} ${tab.badge}` : tab.label}
						</NativeText>
					</Pressable>
				)
			})}
		</View>
	)
}

/** A row of choices that filter a list. */
export function FilterRow<T extends string>({
	choices,
	value,
	onChange,
}: {
	choices: readonly { id: T; label: string }[]
	value: T
	onChange: (id: T) => void
}) {
	return (
		<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
			{choices.map(choice => {
				const active = choice.id === value
				return (
					<Pressable
						key={choice.id}
						onPress={() => onChange(choice.id)}
						style={{
							paddingHorizontal: 12,
							paddingVertical: 6,
							borderRadius: 999,
							backgroundColor: active ? RISK_COLOR.low.soft : SURFACE,
						}}
					>
						<NativeText
							style={{
								fontSize: 12,
								fontWeight: '700',
								color: active ? RISK_COLOR.low.solid : NEUTRAL.solid,
							}}
						>
							{choice.label}
						</NativeText>
					</Pressable>
				)
			})}
		</View>
	)
}

/** A line of small grey capitals above a group. */
export function Heading({ text }: { text: string }) {
	return (
		<Design.Text variant="text-xs/bold" color="text-muted">
			{text.toUpperCase()}
		</Design.Text>
	)
}

/** Code shown in a box with a fixed-width font. */
export function Code({ text }: { text: string }) {
	return (
		<View
			style={{
				backgroundColor: 'rgba(0,0,0,0.25)',
				borderRadius: 8,
				paddingHorizontal: 8,
				paddingVertical: 6,
			}}
		>
			<NativeText
				style={{ fontFamily: 'monospace', fontSize: 11, color: '#C9CDD3' }}
				selectable
			>
				{text}
			</NativeText>
		</View>
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
	const c = RISK_COLOR[finding.severity]
	const placesText = `${finding.count} places`
	return (
		<View
			style={{
				flexDirection: 'row',
				backgroundColor: SURFACE,
				borderRadius: 14,
				overflow: 'hidden',
				opacity: dimmed ? 0.55 : 1,
			}}
		>
			<View style={{ width: 4, backgroundColor: c.solid }} />
			<View style={{ flex: 1, padding: 12, gap: 6 }}>
				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						justifyContent: 'space-between',
						gap: 8,
					}}
				>
					<View style={{ flex: 1 }}>
						<Design.Text variant="text-md/semibold">
							{finding.title}
						</Design.Text>
					</View>
					<SeverityBadge severity={finding.severity} />
				</View>
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
					<View style={{ alignItems: 'flex-start', marginTop: 2 }}>
						<Design.Button
							text={actionText}
							variant="tertiary"
							size="sm"
							onPress={onAction}
						/>
					</View>
				) : null}
			</View>
		</View>
	)
}

/** Two buttons side by side, each taking an equal share. */
export function ButtonRow({ children }: { children: ReactNode }) {
	return <View style={{ flexDirection: 'row', gap: 10 }}>{children}</View>
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
		<View style={{ flex: 1 }}>
			<Design.Button
				text={text}
				variant={variant}
				size="sm"
				disabled={disabled}
				onPress={onPress}
			/>
		</View>
	)
}
