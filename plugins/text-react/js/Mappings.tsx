import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useState } from 'react'
import { Share } from 'react-native'
import { MAX_CUSTOM_WORDS, makeCustomWord } from './custom'
import { MULTIPLE, SINGLE } from './emoji-table'
import { exportSettings, parseSettings } from './share'
import type { TextReactSettings } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const MINE_TITLE = 'Your mappings'
const MINE_HELP =
	'Give a character or a whole word your own emoji, one or several. A mapping beats the built-in one with the same key. Tap a mapping to remove it.'
const NONE = 'You have not added any yet'
const BUILT_IN_SINGLE_TITLE = 'Built-in: characters'
const BUILT_IN_WORDS_TITLE = 'Built-in: words'
const BUILT_IN_HELP =
	'Tap a built-in mapping to turn it off (the character or word is then left out, unless you add your own). Tap again to turn it back on.'
const SHARE_TITLE = 'Share and back up'
const SHARE_HELP =
	'Export copies your settings as JSON and opens the share sheet, so you can save or send them. To use someone’s settings, paste their JSON below and tap Import. Importing replaces your mappings.'
const FILE_NAME = 'text-react-settings.json'

type Json = {
	set(value: Partial<TextReactSettings>): unknown
}

/** A key as shown in a list: a space is written out so it can be seen. */
const show = (key: string) => (key === ' ' ? 'space' : key)

/**
 * The parts of the settings screen for mappings: the person's own mappings with a form to add one, the built-in ones that
 * can be turned off, and export and import of the settings as JSON. A change is saved the moment it is made.
 */
export default function Mappings({
	settings,
	json,
}: {
	settings: TextReactSettings
	json: Json
}) {
	const [word, setWord] = useState('')
	const [emoji, setEmoji] = useState('')
	const [importText, setImportText] = useState('')
	const [status, setStatus] = useState('')

	const mine = settings.customWords ?? []
	const hidden = new Set(settings.hiddenDefaults ?? [])
	const customKeys = new Set(mine.map(entry => entry.word))

	const add = () => {
		const made = makeCustomWord(word, emoji)
		if (typeof made === 'string') return setStatus(made)
		const others = mine.filter(entry => entry.word !== made.word)
		if (others.length >= MAX_CUSTOM_WORDS)
			return setStatus(`You can keep ${MAX_CUSTOM_WORDS} mappings`)
		json.set({ customWords: [...others, made] })
		setWord('')
		setEmoji('')
		setStatus(`Saved ${made.word} ${made.emoji}`)
	}

	const toggle = (key: string) => {
		const next = new Set(hidden)
		if (!next.delete(key)) next.add(key)
		json.set({ hiddenDefaults: [...next] })
	}

	const builtIn = (table: Record<string, string[]>) =>
		Object.keys(table).map(key => (
			<Design.TableRow
				key={key}
				label={show(key)}
				subLabel={
					customKeys.has(key)
						? 'Replaced by your mapping'
						: `${table[key].join(' ')}${hidden.has(key) ? '   (off)' : ''}`
				}
				onPress={() => toggle(key)}
			/>
		))

	const exportNow = () => {
		const text = exportSettings(settings)
		try {
			Clipboard.setString(text)
		} catch {
			// Sharing still works without the clipboard.
		}
		Share.share({ message: text, title: FILE_NAME }).catch(() => {})
		setStatus('Copied to the clipboard and opened the share sheet')
	}

	const importNow = () => {
		const result = parseSettings(importText)
		if (typeof result === 'string') return setStatus(result)
		json.set(result.settings)
		setImportText('')
		const count = result.settings.customWords?.length ?? 0
		setStatus(
			`Imported ${count} mapping${count === 1 ? '' : 's'}${result.skipped ? `, skipped ${result.skipped} that were not valid` : ''}`,
		)
	}

	return (
		<>
			<Design.TableRowGroup title={MINE_TITLE}>
				<Design.TableRow key="help" label="How it works" subLabel={MINE_HELP} />
				{mine.length ? (
					mine.map(entry => (
						<Design.TableRow
							key={entry.word}
							label={`${entry.word}  →  ${entry.emoji}`}
							subLabel="Tap to remove"
							onPress={() =>
								json.set({
									customWords: mine.filter(other => other.word !== entry.word),
								})
							}
						/>
					))
				) : (
					<Design.TableRow key="none" label={NONE} />
				)}
			</Design.TableRowGroup>
			<Design.Stack spacing={12} style={{ paddingHorizontal: 4 }}>
				<Design.TextInput
					label="Character or word"
					placeholder="a, é or a whole word"
					size="md"
					value={word}
					onChange={setWord}
				/>
				<Design.TextInput
					label="Emoji (one or several)"
					placeholder="🍆🍑"
					size="md"
					value={emoji}
					onChange={setEmoji}
				/>
				<Design.Button
					text="Add mapping"
					variant="primary"
					disabled={!word.trim() || !emoji.trim()}
					onPress={add}
				/>
				{status ? (
					<Design.Text variant="text-sm/medium" color="text-muted">
						{status}
					</Design.Text>
				) : null}
			</Design.Stack>
			<Design.TableRowGroup title={BUILT_IN_SINGLE_TITLE}>
				<Design.TableRow key="help" label="Built-in" subLabel={BUILT_IN_HELP} />
				{builtIn(SINGLE)}
			</Design.TableRowGroup>
			<Design.TableRowGroup title={BUILT_IN_WORDS_TITLE}>
				{builtIn(MULTIPLE)}
			</Design.TableRowGroup>
			<Design.Stack spacing={12} style={{ paddingHorizontal: 4 }}>
				<Design.Button
					text="Turn off all built-in mappings"
					variant="secondary"
					onPress={() =>
						json.set({
							hiddenDefaults: [
								...Object.keys(SINGLE),
								...Object.keys(MULTIPLE),
							],
						})
					}
				/>
				<Design.Button
					text="Turn on all built-in mappings"
					variant="secondary"
					onPress={() => json.set({ hiddenDefaults: [] })}
				/>
			</Design.Stack>
			<Design.TableRowGroup title={SHARE_TITLE}>
				<Design.TableRow
					key="help"
					label="Export and import"
					subLabel={SHARE_HELP}
				/>
			</Design.TableRowGroup>
			<Design.Stack spacing={12} style={{ paddingHorizontal: 4 }}>
				<Design.Button
					text="Export settings"
					variant="primary"
					onPress={exportNow}
				/>
				<Design.TextInput
					label="Paste settings JSON"
					placeholder="{ ... }"
					size="md"
					value={importText}
					onChange={setImportText}
					multiline
				/>
				<Design.Button
					text="Import settings"
					variant="secondary"
					disabled={!importText.trim()}
					onPress={importNow}
				/>
			</Design.Stack>
		</>
	)
}
