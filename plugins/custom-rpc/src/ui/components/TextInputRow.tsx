export default function TextInputRow({
	label,
	value,
	onChange,
	placeholder,
	subLabel,
	disabled,
	isClearable,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	placeholder?: string
	subLabel?: string
	disabled?: boolean
	isClearable?: boolean
}) {
	const { View } = valenced.react.ReactNative
	const { TableRow, TextInput, Text } = valenced.discord.design.Design

	const labelNode = (
		<View style={{ flex: 1, gap: 4, paddingVertical: 4 }}>
			<Text variant="text-md/semibold">{label}</Text>
			<TextInput
				placeholder={placeholder}
				value={value}
				onChange={onChange}
				isClearable={isClearable}
			/>
			{subLabel ? (
				<Text variant="text-sm/medium" color="text-muted">
					{subLabel}
				</Text>
			) : null}
		</View>
	)

	return <TableRow disabled={disabled} label={labelNode as any} />
}
