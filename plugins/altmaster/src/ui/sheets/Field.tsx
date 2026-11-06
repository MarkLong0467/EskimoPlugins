import { getDesign } from './helpers'

export function Field({
	label,
	helper,
	placeholder,
	value,
	onChange,
	multiline,
	maxLength,
	secureTextEntry,
	inputRef,
}: {
	label?: string
	helper?: string
	placeholder?: string
	value?: string
	onChange?: (value: string) => void
	multiline?: boolean
	maxLength?: number
	secureTextEntry?: boolean
	inputRef?: any
}) {
	const design = getDesign()
	const { TextInput, TextArea } = design ?? {}
	const InputComponent = multiline === true ? TextArea : TextInput
	if (!InputComponent) return null
	return (
		<InputComponent
			{...({ ref: inputRef } as any)}
			label={label}
			description={helper}
			placeholder={placeholder}
			value={value ?? ''}
			onChange={onChange}
			maxLength={maxLength}
			secureTextEntry={secureTextEntry === true}
			isClearable={multiline !== true}
		/>
	)
}
