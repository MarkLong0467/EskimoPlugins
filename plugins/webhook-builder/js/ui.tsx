/** Small pieces the screens are made of. */

import { Design } from '@valenced/discord/design'
import { useEffect, useRef, useState } from 'react'
import { Alert, View } from 'react-native'
import type { ReactNode } from 'react'

/** How long after the last key a text box saves. */
const COMMIT_MS = 350

interface FieldProps {
	label: string
	value: string
	onChange: (value: string) => void
	placeholder?: string
	description?: string
	/** Shows how many characters are used of this many. */
	max?: number
	multiline?: boolean
	secret?: boolean
}

/** The text boxes on screen that have typing not saved yet, each with what saves it. */
const pending = new Set<() => void>()

/**
 * Saves what was typed into every text box and not saved yet. Called before anything reads the message (sending,
 * saving, copying), so the last few keys are never left out.
 */
export function flushFields(): void {
	for (const save of [...pending]) save()
}

/**
 * A text box that saves a moment after you stop typing, not on every key. Typing not saved yet is saved when the box
 * goes away (going back, changing tabs) or when {@link flushFields} is called. It follows the saved value when that
 * changes from somewhere else (a message loaded into the editor).
 */
export function Field({
	label,
	value,
	onChange,
	placeholder,
	description,
	max,
	multiline,
	secret,
}: FieldProps) {
	const [typed, setTyped] = useState(value)
	const committed = useRef(value)
	const latest = useRef(value)
	const save = useRef<() => void>(() => {})
	save.current = () => {
		pending.delete(saveNow.current)
		if (latest.current === committed.current) return
		committed.current = latest.current
		onChange(latest.current)
	}
	// One function per box, so it can be taken off the pending list.
	const saveNow = useRef(() => save.current())
	useEffect(() => {
		if (value !== committed.current) {
			committed.current = value
			latest.current = value
			setTyped(value)
		}
	}, [value])
	useEffect(() => {
		if (typed === committed.current) return
		const timer = setTimeout(() => save.current(), COMMIT_MS)
		return () => clearTimeout(timer)
	}, [typed])
	// Saves what is left when the box goes away.
	useEffect(() => () => save.current(), [])
	const count = max ? `${typed.length}/${max}` : ''
	const over = !!max && typed.length > max
	const help = [description, count].filter(Boolean).join(' · ') || undefined
	const Input = ((multiline && Design.TextArea) ||
		Design.TextInput) as typeof Design.TextInput
	return (
		<View style={{ marginHorizontal: 16 }}>
			<Input
				label={label}
				value={typed}
				placeholder={placeholder}
				description={over ? undefined : help}
				errorMessage={over ? `Too long: ${count}` : undefined}
				status={over ? 'error' : 'default'}
				secureTextEntry={secret}
				size="md"
				onChange={(next: string) => {
					latest.current = next
					pending.add(saveNow.current)
					setTyped(next)
				}}
			/>
		</View>
	)
}

/** A box of rows with a title. */
export function Group({
	title,
	description,
	children,
}: {
	title?: string
	description?: string
	children: ReactNode
}) {
	return (
		<Design.TableRowGroup title={title} description={description}>
			{children}
		</Design.TableRowGroup>
	)
}

/** The title of a part of a screen, with a line under it if given. */
export function Heading({ title, sub }: { title: string; sub?: string }) {
	return (
		<View style={{ marginHorizontal: 16, marginTop: 4, gap: 2 }}>
			<Design.Text variant="text-sm/bold" color="text-muted">
				{title.toUpperCase()}
			</Design.Text>
			{sub ? (
				<Design.Text variant="text-xs/medium" color="text-muted">
					{sub}
				</Design.Text>
			) : null}
		</View>
	)
}

/** A row that does something when tapped. */
export function Row({
	label,
	sub,
	onPress,
	danger,
	arrow,
	icon,
}: {
	label: string
	sub?: string
	onPress?: () => void
	danger?: boolean
	arrow?: boolean
	icon?: ReactNode
}) {
	return (
		<Design.TableRow
			label={label}
			subLabel={sub}
			onPress={onPress}
			arrow={arrow}
			variant={danger ? 'danger' : undefined}
			icon={icon}
		/>
	)
}

/** A row with a switch. */
export function Toggle({
	label,
	sub,
	value,
	onChange,
}: {
	label: string
	sub?: string
	value: boolean
	onChange: (value: boolean) => void
}) {
	return (
		<Design.TableSwitchRow
			label={label}
			subLabel={sub}
			value={value}
			onValueChange={(v: boolean) => onChange(!!v)}
		/>
	)
}

/** A choice of one of a few, as radio rows. */
export function Choice<T extends string>({
	title,
	value,
	options,
	onChange,
}: {
	title: string
	value: T
	options: { value: T; label: string; sub?: string }[]
	onChange: (value: T) => void
}) {
	return (
		<Design.TableRowGroup title={title}>
			<Design.TableRadioGroup
				defaultValue={value}
				onChange={(v: string) => onChange(v as T)}
			>
				{options.map(o => (
					<Design.TableRadioRow
						key={o.value}
						value={o.value}
						label={o.label}
						subLabel={o.sub}
					/>
				))}
			</Design.TableRadioGroup>
		</Design.TableRowGroup>
	)
}

/** Buttons side by side, each taking an equal share. */
export function Buttons({ children }: { children: ReactNode }) {
	return (
		<View
			style={{
				flexDirection: 'row',
				flexWrap: 'wrap',
				gap: 8,
				marginHorizontal: 16,
			}}
		>
			{children}
		</View>
	)
}

/** One button of {@link Buttons}. */
export function Button({
	text,
	onPress,
	variant = 'secondary',
	disabled,
	loading,
}: {
	text: string
	onPress: () => void
	variant?: 'primary' | 'secondary' | 'tertiary' | 'destructive'
	disabled?: boolean
	loading?: boolean
}) {
	return (
		<View style={{ flexGrow: 1, flexBasis: '30%' }}>
			<Design.Button
				text={text}
				variant={variant}
				size="md"
				disabled={disabled}
				loading={loading}
				onPress={onPress}
			/>
		</View>
	)
}

/** Text in a card, for notes and warnings. */
export function Note({
	text,
	tone,
}: {
	text: string
	tone?: 'danger' | 'muted' | 'positive'
}) {
	const color =
		tone === 'danger'
			? 'text-danger'
			: tone === 'positive'
				? 'text-positive'
				: tone === 'muted'
					? 'text-muted'
					: undefined
	return (
		<View style={{ marginHorizontal: 16 }}>
			<Design.Card>
				<Design.Text variant="text-sm/medium" color={color}>
					{text}
				</Design.Text>
			</Design.Card>
		</View>
	)
}

/** Asks before doing something that cannot be undone. */
export function confirm(
	title: string,
	body: string,
	yes: string,
	run: () => void,
): void {
	Alert.alert(
		title,
		body,
		[
			{ text: 'Cancel', style: 'cancel' },
			{ text: yes, style: 'destructive', onPress: run },
		],
		{ cancelable: true },
	)
}

/** Runs something that talks to Discord, while the button shows that it is busy. A second tap meanwhile does nothing. */
export function useBusy(): [boolean, (run: () => Promise<unknown>) => void] {
	const [busy, setBusy] = useState(false)
	const start = (run: () => Promise<unknown>) => {
		if (busy) return
		setBusy(true)
		run().finally(() => setBusy(false))
	}
	return [busy, start]
}
