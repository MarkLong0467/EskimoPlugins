import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import { applyPreset } from './apply'
import { Card, Chip, Dot, Field, Radio } from './components'
import {
	CLEAR_AFTER,
	CONFIRM_MS,
	CUSTOM_MODES,
	EMOJI_CHOICES,
	MAX_NAME,
	MAX_TEXT,
	STATUSES,
} from './constants'
import {
	cleanPreset,
	clearLabel,
	emojiText,
	newId,
	readPresets,
	statusInfo,
	writePresets,
} from './presets'
import { toast } from './state'
import type { Preset } from './types'

interface Props {
	/** The id of the preset to edit. If no preset has it, a new one is made. */
	id: string
	/** Called to go back to the list. */
	onBack: () => void
}

/**
 * Edits one preset. What is changed is kept in a draft: nothing is saved until Save is tapped. It shows a preview, the
 * name, the online status, the custom status (text, emoji and quick emoji picks) and when to switch back. It can also
 * apply the draft without saving, move the preset up or down, duplicate it, and delete it (tap twice to confirm).
 */
export default function EditPreset({ id, onBack }: Props) {
	const existing = readPresets().find(p => p.id === id)
	const [draft, setDraft] = useState<Preset>(
		() =>
			existing ||
			cleanPreset({
				id,
				name: '',
				status: 'online',
				custom: 'set',
				clearAfter: 'never',
			}),
	)
	const [sure, setSure] = useState(false)
	const set =
		<K extends keyof Preset>(key: K) =>
		(value: Preset[K] | string) =>
			setDraft(d => ({ ...d, [key]: value }) as Preset)
	const isNew = !existing
	const info = statusInfo(draft.status)

	const save = (andBack = true) => {
		const next = cleanPreset({
			...draft,
			name: draft.name.trim() || draft.text.trim().slice(0, 20) || info.l,
		})
		const list = readPresets()
		writePresets(
			list.some(p => p.id === next.id)
				? list.map(p => (p.id === next.id ? next : p))
				: [...list, next],
		)
		toast(`Saved ${next.name}`)
		if (andBack) onBack()
	}
	const move = (delta: number) => {
		const list = readPresets()
		const index = list.findIndex(p => p.id === draft.id)
		const target = index + delta
		if (index < 0 || target < 0 || target >= list.length) return
		const copy = list.slice()
		;[copy[index], copy[target]] = [copy[target], copy[index]]
		writePresets(copy)
	}
	const copyOf = () => {
		const copy = cleanPreset({
			...draft,
			id: newId(),
			name: `${draft.name || 'Preset'} copy`.slice(0, MAX_NAME),
		})
		writePresets([...readPresets(), copy])
		toast('Duplicated')
		onBack()
	}
	const remove = () => {
		if (!sure) {
			setSure(true)
			setTimeout(() => setSure(false), CONFIRM_MS)
			return
		}
		writePresets(readPresets().filter(p => p.id !== draft.id))
		toast('Deleted')
		onBack()
	}

	const previewText =
		draft.custom === 'set'
			? draft.text || (emojiText(draft.emoji) ? '' : 'Your text')
			: draft.custom === 'clear'
				? 'Custom status removed'
				: 'Custom status stays as it is'
	const title = `${draft.name || 'Untitled'}`
	const statusLine = `${info.v === 'keep' ? 'Status stays as it is' : info.l}${draft.status !== 'keep' && draft.status !== 'online' && draft.clearAfter !== 'never' ? ` for ${clearLabel(draft.clearAfter).toLowerCase()}` : ''}`
	const customPreview = `${draft.custom === 'set' && emojiText(draft.emoji) ? `${emojiText(draft.emoji)} ` : ''}${previewText}`
	const showClearAfter =
		draft.custom === 'set' ||
		draft.status === 'dnd' ||
		draft.status === 'idle' ||
		draft.status === 'invisible'

	return (
		<View style={{ gap: 18 }}>
			<Design.TableRow key="back" label="‹ All presets" onPress={onBack} />
			<Card>
				<Design.Text variant="text-xs/bold" color="text-muted">
					{isNew ? 'NEW PRESET' : 'PREVIEW'}
				</Design.Text>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
					<Dot color={info.color} />
					<Design.Text variant="heading-lg/bold">{title}</Design.Text>
				</View>
				<Design.Text variant="text-md/medium">{statusLine}</Design.Text>
				<Design.Text variant="text-md/medium" color="text-muted">
					{customPreview}
				</Design.Text>
			</Card>
			<Field
				key="name"
				label="Name"
				placeholder="Busy"
				maxLength={MAX_NAME}
				value={draft.name}
				onChange={set('name')}
			/>
			<Radio
				title="Online status"
				value={draft.status}
				items={STATUSES}
				onChange={set('status')}
			/>
			<Radio
				title="Custom status"
				value={draft.custom}
				items={CUSTOM_MODES}
				onChange={set('custom')}
			/>
			{draft.custom === 'set' && (
				<View key="customFields" style={{ gap: 12 }}>
					<Field
						key="text"
						label="Text"
						placeholder="What are you up to?"
						maxLength={MAX_TEXT}
						value={draft.text}
						onChange={set('text')}
					/>
					<Field
						key="emoji"
						label="Emoji"
						description="Type or paste an emoji, or a server emoji like <:name:123456789012345678>. Leave empty for none."
						placeholder="😴"
						maxLength={64}
						value={draft.emoji}
						onChange={set('emoji')}
					/>
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
						<Chip
							key="none"
							text="No emoji"
							selected={!draft.emoji}
							onPress={() => set('emoji')('')}
						/>
						{EMOJI_CHOICES.map(emoji => (
							<Chip
								key={emoji}
								text={emoji}
								selected={draft.emoji === emoji}
								onPress={() => set('emoji')(emoji)}
							/>
						))}
					</View>
				</View>
			)}
			{showClearAfter && (
				<Radio
					title="Switch back after"
					value={draft.clearAfter}
					items={CLEAR_AFTER}
					onChange={set('clearAfter')}
				/>
			)}
			<View style={{ gap: 10 }}>
				<Design.Button
					text="Save"
					variant="primary"
					onPress={() => save(true)}
				/>
				<Design.Button
					text="Apply now (without saving)"
					variant="secondary"
					onPress={() =>
						applyPreset({ ...draft, name: draft.name || 'Preset' })
					}
				/>
				{!isNew && (
					<View style={{ flexDirection: 'row', gap: 10 }}>
						<View style={{ flex: 1 }}>
							<Design.Button
								text="↑ Move up"
								variant="secondary"
								size="sm"
								onPress={() => move(-1)}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<Design.Button
								text="↓ Move down"
								variant="secondary"
								size="sm"
								onPress={() => move(1)}
							/>
						</View>
					</View>
				)}
				{!isNew && (
					<Design.Button
						text="Duplicate"
						variant="secondary"
						size="sm"
						onPress={copyOf}
					/>
				)}
				{!isNew && (
					<Design.Button
						text={sure ? 'Tap again to delete' : 'Delete'}
						variant="destructive"
						size="sm"
						onPress={remove}
					/>
				)}
			</View>
		</View>
	)
}
