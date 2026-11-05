import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import type { ReactNode } from 'react'
import type { Choice } from './types'

/** A rounded box that groups part of the screen. */
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

/** A small round dot in a color, such as the one before a status. */
export function Dot({
	color,
	size = 12,
}: {
	color: string | undefined
	size?: number
}) {
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: color,
			}}
		/>
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
					minWidth: 44,
					minHeight: 38,
					paddingHorizontal: 11,
					alignItems: 'center',
					justifyContent: 'center',
					borderRadius: 10,
					backgroundColor: selected ? '#5865f2' : '#383a40',
				}}
			>
				<Design.Text variant="text-md/semibold" style={{ color: '#fff' }}>
					{text}
				</Design.Text>
			</View>
		</Pressable>
	)
}

interface FieldProps {
	label: string
	description?: string
	value: string | undefined
	placeholder?: string
	maxLength?: number
	onChange: (value: string) => void
}

/** A text box that keeps what you type while the screen redraws. */
export function Field({
	label,
	description,
	value,
	placeholder,
	maxLength,
	onChange,
}: FieldProps) {
	const shown = value == null ? '' : String(value)
	const [text, setText] = useState(shown)
	useEffect(() => {
		if (shown !== text) setText(shown)
	}, [value])
	return (
		<Design.TextInput
			label={label}
			description={description}
			placeholder={placeholder}
			size="md"
			maxLength={maxLength}
			value={text}
			onChange={(next: string) => {
				setText(next)
				onChange(next)
			}}
		/>
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
	items: Choice[]
	onChange: (value: string) => void
}) {
	return (
		<Design.TableRadioGroup title={title} value={value} onChange={onChange}>
			{items.map(item => (
				<Design.TableRadioRow
					key={String(item.v)}
					label={item.l}
					value={item.v}
				/>
			))}
		</Design.TableRadioGroup>
	)
}
