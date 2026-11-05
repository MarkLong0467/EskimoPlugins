import { Design } from '@valenced/discord/design'
import { Pressable, View } from 'react-native'
import type { ReactNode } from 'react'
import type { RadioItem } from './types'

/** A rounded box that groups some settings. */
export function Card({ children }: { children?: ReactNode }) {
	return (
		<View
			style={{
				borderRadius: 14,
				padding: 14,
				gap: 10,
				backgroundColor: '#2b2d31',
			}}
		>
			{children}
		</View>
	)
}

/** A small rounded label in a color, such as "On". */
export function Pill({ text, color }: { text: string; color: string }) {
	return (
		<View
			style={{
				paddingHorizontal: 9,
				paddingVertical: 3,
				borderRadius: 999,
				backgroundColor: `${color}33`,
			}}
		>
			<Design.Text variant="text-xs/bold" style={{ color }}>
				{text}
			</Design.Text>
		</View>
	)
}

/** A tappable choice, filled when selected. */
export function Chip({
	text,
	selected,
	onPress,
}: {
	text: string
	selected: boolean
	onPress: () => void
}) {
	return (
		<Pressable onPress={onPress} accessibilityRole="button">
			<View
				style={{
					minHeight: 36,
					minWidth: 48,
					paddingHorizontal: 12,
					alignItems: 'center',
					justifyContent: 'center',
					borderRadius: 10,
					backgroundColor: selected ? '#5865f2' : '#383a40',
				}}
			>
				<Design.Text variant="text-sm/semibold" style={{ color: '#fff' }}>
					{text}
				</Design.Text>
			</View>
		</Pressable>
	)
}

/** A group of radio rows: pick one of several named choices. */
export function Radio({
	title,
	value,
	items,
	onChange,
}: {
	title: string
	value: string
	items: RadioItem[]
	onChange: (value: string) => void
}) {
	return (
		<Design.TableRadioGroup title={title} value={value} onChange={onChange}>
			{items.map(item => (
				<Design.TableRadioRow
					key={String(item.v)}
					label={item.l}
					subLabel={item.s}
					value={item.v}
				/>
			))}
		</Design.TableRadioGroup>
	)
}

interface PickerProps {
	title: string
	subtitle?: string
	value: number
	options: number[]
	/** How a number is written on its chip. Defaults to the number itself. */
	format?: (option: number) => string
	onPick: (option: number) => void
}

/** A row of chips for picking a number. */
export function Picker({
	title,
	subtitle,
	value,
	options,
	format,
	onPick,
}: PickerProps) {
	return (
		<View style={{ gap: 8, paddingHorizontal: 4 }}>
			<Design.Text variant="text-sm/semibold" color="text-muted">
				{title}
			</Design.Text>
			{subtitle ? (
				<Design.Text variant="text-xs/medium" color="text-muted">
					{subtitle}
				</Design.Text>
			) : null}
			<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
				{options.map(option => (
					<Chip
						key={String(option)}
						text={format ? format(option) : String(option)}
						selected={Number(value) === option}
						onPress={() => onPick(option)}
					/>
				))}
			</View>
		</View>
	)
}
