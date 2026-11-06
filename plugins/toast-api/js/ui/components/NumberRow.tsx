import type { ReactNode } from 'react'

export function NumberCard({ children }: { children: ReactNode }) {
	const { Card } = valenced.discord.design.Design
	return <Card style={{ padding: 16, gap: 20 }}>{children}</Card>
}

function parse(text: string): number {
	return Number.parseFloat(text)
}

/**
 * The precision the step implies: `0.5` keeps a tenth, `1` and above keep whole
 * numbers. The field must not be less precise than the step it replaced.
 */
function precisionOf(step: number): number {
	if (!(step > 0) || step >= 1) return 0
	const text = `${step}`
	const dot = text.indexOf('.')
	return dot === -1 ? 0 : text.length - dot - 1
}

/**
 * Keep only what can belong to a number, so a stray letter or a second decimal
 * point never reaches the setting — and drop the leading zeroes a numeric keypad
 * tends to produce ("007" → "7", while "0.5" keeps its zero).
 */
function sanitize(text: string): string {
	let out = ''
	for (const char of text) {
		if (char >= '0' && char <= '9') out += char
		else if (char === '.' && !out.includes('.')) out += char
		else if (char === '-' && out === '') out += char
	}
	while (out.length > 1 && out[0] === '0' && out[1] !== '.') out = out.slice(1)
	return out
}

/**
 * A numeric setting, as Discord's own `TextInput` rather than a slider. Inside
 * an action sheet on Android a slider never gets the drag — the sheet's own
 * responder answers first — and a field can be typed into as well as tapped.
 *
 * `TextInput` renders the label, the field and the description under it; this
 * component only validates what is typed.
 */
export function NumberRow({
	label,
	value,
	minimum,
	maximum,
	step = 1,
	display,
	onChange,
}: {
	label: string
	value: number
	minimum: number
	maximum: number
	step?: number
	display?: (value: number) => string
	onChange: (value: number) => void
}) {
	const { useEffect, useState } = valenced.react.React
	const { TextInput } = valenced.discord.design.Design as any
	const [draft, setDraft] = useState(() => `${value}`)

	// Follow writes made from anywhere else (another sheet, a reset) without
	// clobbering whatever is being typed right now.
	useEffect(() => {
		setDraft(current => (parse(current) === value ? current : `${value}`))
	}, [value])

	const push = (text: string) => {
		const clean = sanitize(text)
		setDraft(clean)
		const parsed = parse(clean)
		if (!Number.isFinite(parsed)) return
		const precision = precisionOf(step)
		const rounded =
			precision === 0 ? Math.round(parsed) : Number(parsed.toFixed(precision))
		const next = Math.min(maximum, Math.max(minimum, rounded))
		// Clamping or rounding moved it — show what was stored, not what was typed.
		if (next !== parsed) setDraft(`${next}`)
		if (next !== value) onChange(next)
	}

	// An empty field keeps the last valid number — put it back when focus
	// leaves, so the row is never left blank.
	const restore = () => {
		if (!Number.isFinite(parse(draft))) setDraft(`${value}`)
	}

	const current = display ? display(value) : `${value}`

	return (
		<TextInput
			label={label}
			value={draft}
			description={`${current} · ${minimum} – ${maximum}`}
			placeholder={`${minimum} – ${maximum}`}
			keyboardType="decimal-pad"
			returnKeyType="done"
			onChange={push}
			onBlur={restore}
		/>
	)
}

export function seconds(value: number): string {
	return `${(value / 1000).toFixed(1)} s`
}

export function secondsOff(value: number): string {
	return value === 0 ? 'Off' : seconds(value)
}
