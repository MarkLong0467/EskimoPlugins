import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import ActionSheetBody from './ActionSheetBody'
import { DEFAULT_SETTINGS, EDIT_SHEET_KEY } from './constants'
import { keyLabel, looksLikeEmoji, MAX_LIST_EMOJI, splitEmoji } from './custom'
import { sheets } from './discord'
import { MULTIPLE, SINGLE } from './emoji-table'
import type { TextReactSettings } from './types'

/** The storage of the settings, as far as the editor uses it. */
export interface Json {
	/** Merges the value into the settings, or replaces all of them. A key can only be removed by replacing. */
	set(value: Partial<TextReactSettings>, replace?: boolean): unknown
	use?(): Partial<TextReactSettings> | undefined
}

/** Texts as constants because React Native text must be passed as an expression. */
const HELP =
	'Reactions are tried from the top. If an emoji is already on the message, the next one is used. Tap an emoji to remove it. To move one, add it again at the top or at the end.'
const EMPTY = 'No emoji. This character or word is left out.'

/** The built-in emoji of a character or a word, in the order they are tried. */
export function builtInList(key: string): string[] {
	return (SINGLE[key] ?? MULTIPLE[key] ?? []).slice()
}

/**
 * The sheet for the emoji of one character or word: the list in the order it is tried, with every emoji removable, a way to
 * move one to the top, a field to add more (at the end or at the top), and buttons to go back to the built-in list or turn the
 * key off. A change is saved at once and replaces the built-in list of that key.
 */
export default function EmojiEditor({
	keyName,
	json,
}: {
	keyName: string
	json: Json
}) {
	const settings = { ...DEFAULT_SETTINGS, ...(json.use?.() ?? {}) }
	const overrides = settings.overrides ?? {}
	const edited = keyName in overrides
	const list = overrides[keyName] ?? builtInList(keyName)
	const off = (settings.hiddenDefaults ?? []).includes(keyName)
	const [text, setText] = useState('')
	const [status, setStatus] = useState('')

	const title = `Emoji for ${keyLabel(keyName)}`

	const save = (next: string[]) =>
		json.set({ overrides: { ...overrides, [keyName]: next } })

	const add = (atFront: boolean) => {
		const pieces = splitEmoji(text)
		if (!pieces.length || !pieces.every(looksLikeEmoji))
			return setStatus('Add emoji only')
		const chosen = pieces.filter(
			(piece, index) => pieces.indexOf(piece) === index,
		)
		// An emoji that is in the list already is moved, so adding it again is how to reorder.
		const rest = list.filter(other => !chosen.includes(other))
		if (rest.length + chosen.length > MAX_LIST_EMOJI)
			return setStatus(`A list holds ${MAX_LIST_EMOJI} emoji`)
		save(atFront ? [...chosen, ...rest] : [...rest, ...chosen])
		setText('')
		setStatus('')
	}

	const reset = () => {
		const { [keyName]: _removed, ...rest } = overrides
		// Settings are merged deeply, so removing a key means replacing the whole object.
		json.set({ ...settings, overrides: rest }, true)
	}

	const toggleOff = () => {
		const hidden = new Set(settings.hiddenDefaults ?? [])
		if (!hidden.delete(keyName)) hidden.add(keyName)
		json.set({ hiddenDefaults: [...hidden] })
	}

	return (
		<ActionSheetBody>
			<Design.Text variant="heading-lg/bold">{title}</Design.Text>
			<Design.Text variant="text-sm/medium" color="text-muted">
				{HELP}
			</Design.Text>
			<Design.TableRowGroup>
				{list.length ? (
					list.map((emoji, index) => (
						<Design.TableRow
							key={emoji}
							label={`${index + 1}.  ${emoji}`}
							subLabel={index === 0 ? 'Tried first' : undefined}
							onPress={() => save(list.filter(other => other !== emoji))}
						/>
					))
				) : (
					<Design.TableRow key="empty" label={EMPTY} />
				)}
			</Design.TableRowGroup>
			<Design.TextInput
				label="Add emoji"
				placeholder="🍎🍐"
				size="md"
				value={text}
				onChange={setText}
			/>
			{status ? (
				<Design.Text variant="text-sm/medium" color="text-muted">
					{status}
				</Design.Text>
			) : null}
			<Design.Button
				text="Add at the end"
				variant="primary"
				disabled={!text.trim()}
				onPress={() => add(false)}
			/>
			<Design.Button
				text="Add at the top"
				variant="secondary"
				disabled={!text.trim()}
				onPress={() => add(true)}
			/>
			<Design.Button
				text="Back to the built-in list"
				variant="secondary"
				disabled={!edited}
				onPress={reset}
			/>
			<Design.Button
				text={off ? 'Turn on' : 'Turn off'}
				variant="secondary"
				onPress={toggleOff}
			/>
			<Design.Button
				text="Close"
				variant="secondary"
				onPress={() => sheets().hideActionSheet(EDIT_SHEET_KEY)}
			/>
		</ActionSheetBody>
	)
}
