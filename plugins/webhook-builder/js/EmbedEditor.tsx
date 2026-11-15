/** The editor of one embed: every part of it, its fields, its gallery, and moving or copying it. */

import { Design } from '@valenced/discord/design'
import { Pressable, View } from 'react-native'
import { COLORS, LIMITS, newId } from './constants'
import { Preview } from './Preview'
import { embedLength } from './payload'
import { editDraft, state } from './state'
import { parseWhen, typedOf } from './time'
import {
	Button,
	Buttons,
	Choice,
	Field,
	flushFields,
	Group,
	Heading,
	Note,
	Row,
	Toggle,
} from './ui'
import type { Embed, EmbedField, TimestampMode } from './types'

/** Changes the embed with this key. */
function change(key: string, fn: (embed: Embed) => void): void {
	editDraft(d => {
		const embed = d.embeds.find(e => e.key === key)
		if (embed) fn(embed)
	})
}

/** Moves an item of a list up or down by one. */
export function move<T>(list: T[], index: number, by: -1 | 1): void {
	const to = index + by
	if (to < 0 || to >= list.length) return
	const [item] = list.splice(index, 1)
	list.splice(to, 0, item as T)
}

/** A colour as a dot you can tap. */
function Swatch({
	name,
	hex,
	chosen,
	onPress,
}: {
	name: string
	hex: string
	chosen: boolean
	onPress: () => void
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={name}
			onPress={onPress}
			style={{
				width: 34,
				height: 34,
				borderRadius: 17,
				backgroundColor: hex,
				borderWidth: chosen ? 3 : 1,
				borderColor: chosen ? '#ffffff' : 'rgba(128,128,128,0.5)',
			}}
		/>
	)
}

/** One field of the embed. */
function FieldEditor({
	embedKey,
	field,
	index,
	count,
}: {
	embedKey: string
	field: EmbedField
	index: number
	count: number
}) {
	const set = (fn: (f: EmbedField) => void) =>
		change(embedKey, e => e.fields[index] && fn(e.fields[index]))
	return (
		<Design.Stack spacing={8}>
			<Field
				label={`Field ${index + 1} name`}
				value={field.name}
				max={LIMITS.fieldName}
				onChange={v => set(f => void (f.name = v))}
			/>
			<Field
				label={`Field ${index + 1} value`}
				value={field.value}
				max={LIMITS.fieldValue}
				multiline
				onChange={v => set(f => void (f.value = v))}
			/>
			<Group>
				<Toggle
					label="Inline"
					sub="Up to three inline fields sit side by side"
					value={field.inline}
					onChange={v => set(f => void (f.inline = v))}
				/>
			</Group>
			<Buttons>
				<Button
					text="Up"
					disabled={index === 0}
					onPress={() => change(embedKey, e => move(e.fields, index, -1))}
				/>
				<Button
					text="Down"
					disabled={index === count - 1}
					onPress={() => change(embedKey, e => move(e.fields, index, 1))}
				/>
				<Button
					text="Copy"
					disabled={count >= LIMITS.fields}
					onPress={() =>
						change(
							embedKey,
							e => void e.fields.splice(index + 1, 0, { ...field }),
						)
					}
				/>
				<Button
					text="Remove"
					variant="destructive"
					onPress={() => change(embedKey, e => void e.fields.splice(index, 1))}
				/>
			</Buttons>
		</Design.Stack>
	)
}

const TIMESTAMPS: { value: TimestampMode; label: string; sub?: string }[] = [
	{ value: 'none', label: 'None' },
	{
		value: 'sent',
		label: 'When it is sent',
		sub: 'Each reader sees it in their own time',
	},
	{ value: 'fixed', label: 'A time you choose' },
]

/** The editor. */
export function EmbedEditor({
	embedKey,
	onBack,
}: {
	embedKey: string
	onBack: () => void
}) {
	const draft = state().draft
	const index = draft.embeds.findIndex(e => e.key === embedKey)
	const embed = draft.embeds[index]
	if (!embed)
		return (
			<Design.Stack spacing={16} style={{ paddingVertical: 16 }}>
				<Note text="This embed is gone." />
				<Buttons>
					<Button text="Back" onPress={onBack} />
				</Buttons>
			</Design.Stack>
		)
	const set = (fn: (e: Embed) => void) => change(embedKey, fn)
	const total = draft.embeds.reduce((sum, e) => sum + embedLength(e), 0)
	return (
		<Design.Stack spacing={18} style={{ paddingVertical: 16 }}>
			<Buttons>
				<Button
					text="← Back to the message"
					onPress={() => {
						flushFields()
						onBack()
					}}
				/>
			</Buttons>
			<Note
				tone={total > LIMITS.embedTotal ? 'danger' : 'muted'}
				text={`Embed ${index + 1} of ${draft.embeds.length} · ${embedLength(embed)} characters · all embeds ${total}/${LIMITS.embedTotal}`}
			/>
			<Heading title={'Author'} />
			<Field
				label="Author name"
				value={embed.authorName}
				max={LIMITS.author}
				onChange={v => set(e => void (e.authorName = v))}
			/>
			<Field
				label="Author link"
				placeholder="https://"
				value={embed.authorUrl}
				onChange={v => set(e => void (e.authorUrl = v))}
			/>
			<Field
				label="Author icon"
				placeholder="https:// link to a picture"
				value={embed.authorIcon}
				onChange={v => set(e => void (e.authorIcon = v))}
			/>
			<Heading title={'Body'} />
			<Field
				label="Title"
				value={embed.title}
				max={LIMITS.title}
				onChange={v => set(e => void (e.title = v))}
			/>
			<Field
				label="Title link"
				placeholder="https://"
				value={embed.url}
				onChange={v => set(e => void (e.url = v))}
			/>
			<Field
				label="Description"
				value={embed.description}
				max={LIMITS.description}
				multiline
				description="Markdown works: **bold**, *italic*, [links](https://…), lists, > quotes"
				onChange={v => set(e => void (e.description = v))}
			/>
			<Heading
				title={'Colour'}
				sub={embed.color ? `Now ${embed.color}` : 'No colour: the bar is grey'}
			/>
			<View
				style={{
					flexDirection: 'row',
					flexWrap: 'wrap',
					gap: 6,
					marginHorizontal: 16,
				}}
			>
				{COLORS.map(c => (
					<Swatch
						name={c.name}
						key={c.hex}
						hex={c.hex}
						chosen={embed.color.toLowerCase() === c.hex}
						onPress={() => set(e => void (e.color = c.hex))}
					/>
				))}
			</View>
			<Field
				label="Colour code"
				placeholder="#5865f2"
				value={embed.color}
				onChange={v => set(e => void (e.color = v.trim()))}
			/>
			<Buttons>
				<Button
					text="Random colour"
					onPress={() =>
						set(
							e =>
								void (e.color = `#${Math.floor(Math.random() * 0xffffff)
									.toString(16)
									.padStart(6, '0')}`),
						)
					}
				/>
				<Button
					text="No colour"
					onPress={() => set(e => void (e.color = ''))}
				/>
			</Buttons>
			<Heading title={`Fields (${embed.fields.length}/${LIMITS.fields})`} />
			{embed.fields.map((f, i) => (
				<FieldEditor
					key={`${embedKey}-field-${i}`}
					embedKey={embedKey}
					field={f}
					index={i}
					count={embed.fields.length}
				/>
			))}
			<Buttons>
				<Button
					text="Add field"
					disabled={embed.fields.length >= LIMITS.fields}
					onPress={() =>
						set(e => void e.fields.push({ name: '', value: '', inline: false }))
					}
				/>
				<Button
					text="Add inline field"
					disabled={embed.fields.length >= LIMITS.fields}
					onPress={() =>
						set(e => void e.fields.push({ name: '', value: '', inline: true }))
					}
				/>
			</Buttons>
			<Heading title={'Pictures'} />
			<Field
				label="Picture"
				placeholder="https:// link to a picture or GIF"
				value={embed.image}
				onChange={v => set(e => void (e.image = v))}
			/>
			<Field
				label="Thumbnail (top right)"
				placeholder="https://"
				value={embed.thumbnail}
				onChange={v => set(e => void (e.thumbnail = v))}
			/>
			{embed.gallery.map((g, i) => (
				<Field
					key={`${embedKey}-gallery-${i}`}
					label={`Gallery picture ${i + 2}`}
					description="Leave empty to remove it"
					value={g}
					onChange={v =>
						set(e => {
							if (v.trim()) e.gallery[i] = v
							else e.gallery.splice(i, 1)
						})
					}
				/>
			))}
			{embed.gallery.length < LIMITS.gallery ? (
				<Buttons>
					<Button
						text="Add a gallery picture"
						onPress={() => set(e => void e.gallery.push(''))}
					/>
				</Buttons>
			) : null}
			{embed.gallery.length && !embed.url.trim() ? (
				<Note
					tone="danger"
					text="A gallery needs a title link: Discord groups the pictures by it."
				/>
			) : null}
			<Heading title={'Footer'} />
			<Field
				label="Footer text"
				value={embed.footerText}
				max={LIMITS.footer}
				onChange={v => set(e => void (e.footerText = v))}
			/>
			<Field
				label="Footer icon"
				placeholder="https://"
				value={embed.footerIcon}
				onChange={v => set(e => void (e.footerIcon = v))}
			/>
			<Choice
				title="Time in the footer"
				value={embed.timestampMode}
				options={TIMESTAMPS}
				onChange={v =>
					set(e => {
						e.timestampMode = v
						if (v === 'fixed' && !e.timestamp) e.timestamp = Date.now()
					})
				}
			/>
			{embed.timestampMode === 'fixed' ? (
				<Field
					label="Time"
					description="As 2026-12-24 18:00, 18:30, tomorrow 9:00 or in 2h"
					value={embed.timestamp ? typedOf(embed.timestamp) : ''}
					onChange={v => {
						const at = parseWhen(v)
						if (at) set(e => void (e.timestamp = at))
					}}
				/>
			) : null}
			<Group title="This embed">
				<Row
					label="Move up"
					onPress={
						index > 0
							? () => editDraft(d => move(d.embeds, index, -1))
							: undefined
					}
				/>
				<Row
					label="Move down"
					onPress={
						index < draft.embeds.length - 1
							? () => editDraft(d => move(d.embeds, index, 1))
							: undefined
					}
				/>
				<Row
					label="Make a copy"
					sub="The copy goes after this one"
					onPress={
						draft.embeds.length < LIMITS.embeds
							? () =>
									editDraft(
										d =>
											void d.embeds.splice(index + 1, 0, {
												...JSON.parse(JSON.stringify(embed)),
												key: newId(),
											}),
									)
							: undefined
					}
				/>
				<Row
					label="Remove this embed"
					danger
					onPress={() => {
						editDraft(d => {
							d.embeds = d.embeds.filter(e => e.key !== embedKey)
						})
						onBack()
					}}
				/>
			</Group>
			<Heading title={'Preview'} />
			<Preview
				draft={{
					...draft,
					content: '',
					poll: null,
					buttons: [],
					embeds: [embed],
				}}
			/>
		</Design.Stack>
	)
}
