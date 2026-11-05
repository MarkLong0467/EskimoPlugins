import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { FIELD_COMMIT_MS } from './constants'

interface Props {
	label: string
	description?: string
	placeholder?: string
	maxLength?: number
	/** The saved value. */
	value: string | number | undefined
	/** Called with the text once typing has paused, to save it. */
	onCommit: (value: string) => void
}

/** A text box that saves a moment after you stop typing, not on every key. */
export default function Field({
	label,
	description,
	placeholder,
	maxLength,
	value,
	onCommit,
}: Props) {
	const saved = value == null ? '' : String(value)
	const [typed, setTyped] = useState(saved)
	useEffect(() => {
		if (typed === saved) return
		const timer = setTimeout(() => onCommit(typed), FIELD_COMMIT_MS)
		return () => clearTimeout(timer)
	}, [typed])

	return (
		<Design.TextInput
			label={label}
			description={description}
			placeholder={placeholder}
			size="md"
			maxLength={maxLength}
			value={typed}
			onChange={setTyped}
		/>
	)
}
