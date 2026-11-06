import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useState } from 'react'
import { Share } from 'react-native'
import { EDIT_SHEET_KEY } from './constants'
import {
	formatList,
	keyLabel,
	MAX_CUSTOM_WORDS,
	makeCustomWord,
	parseList,
} from './custom'
import { sheets } from './discord'
import EmojiEditor from './EmojiEditor'
import { MULTIPLE, SINGLE } from './emoji-table'
import { exportSettings, parseSettings } from './share'
import type { Json } from './EmojiEditor'
import type { TextReactSettings } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const MINE_TITLE = 'Your mappings'
const MINE_HELP =
	'Give a character or a whole word your own emoji, one or several. A mapping beats the built-in one with the same key. Tap a mapping to remove it.'
const NONE = 'You have not added any yet'
const BUILT_IN_SINGLE_TITLE = 'Built-in: characters'
const BUILT_IN_WORDS_TITLE = 'Built-in: words'
const BUILT_IN_HELP =
	'Tap a character or word to see its emoji in the order they are tried, and to add, remove or reorder them or turn it off.'
const SHARE_TITLE = 'Share and back up'
const SHARE_HELP =
	'Export copies your settings as JSON and opens the share sheet, so you can save or send them. To use someone’s settings, paste their JSON below and tap Import. Importing replaces your mappings.'
const FILE_NAME = 'text-react-settings.json'

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

	const overrides = settings.overrides ?? {}
	const [listText, setListText] = useState('')

	/** Opens the sheet that edits the emoji of one character or word. */
	const edit = (key: string) =>
		sheets().openLazy(
			Promise.resolve({
				default: () => <EmojiEditor keyName={key} json={json} />,
			}),
			EDIT_SHEET_KEY,
			{},
		)

	const builtIn = (table: Record<string, string[]>) =>
		Object.keys(table).map(key => {
			const list = overrides[key] ?? table[key]
			return (
				<Design.TableRow
					key={key}
					label={keyLabel(key)}
					subLabel={
						customKeys.has(key)
							? 'Replaced by your mapping'
							: `${list.join(' ') || 'No emoji'}${overrides[key] ? '   (edited)' : ''}${hidden.has(key) ? '   (off)' : ''}`
					}
					onPress={() => edit(key)}
				/>
			)
		})

	/** Your own lists for keys that are not built in (made by pasting a list). */
	const extraKeys = Object.keys(overrides).filter(
		key => !(key in SINGLE) && !(key in MULTIPLE),
	)

	/** Every built-in list as it is now, one key per line. */
	const currentLists = () => {
		const lists: Record<string, string[]> = {}
		for (const key of [...Object.keys(SINGLE), ...Object.keys(MULTIPLE)])
			lists[key] = overrides[key] ?? SINGLE[key] ?? MULTIPLE[key]
		return lists
	}

	const copyLists = () => {
		try {
			Clipboard.setString(formatList(currentLists()))
			setStatus(
				'Copied the built-in lists. Paste them anywhere, edit, and apply them below',
			)
		} catch {
			setStatus('Could not copy')
		}
	}

	const applyLists = () => {
		const { lists, skipped } = parseList(listText)
		const count = Object.keys(lists).length
		if (!count) return setStatus('No lines like  a: 🅰 🇦  found')
		json.set({ overrides: { ...overrides, ...lists } })
		setListText('')
		setStatus(
			`Applied ${count} list${count === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} line${skipped === 1 ? '' : 's'}` : ''}`,
		)
	}

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
		// The file replaces what it holds (mappings, lists), so the whole settings are replaced, not merged.
		json.set({ ...settings, ...result.settings }, true)
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
			{extraKeys.length ? (
				<Design.TableRowGroup title="Your emoji lists">
					{extraKeys.map(key => (
						<Design.TableRow
							key={key}
							label={keyLabel(key)}
							subLabel={overrides[key].join(' ')}
							onPress={() => edit(key)}
						/>
					))}
				</Design.TableRowGroup>
			) : null}
			<Design.Stack spacing={12} style={{ paddingHorizontal: 4 }}>
				<Design.Button
					text="Copy all built-in lists"
					variant="secondary"
					onPress={copyLists}
				/>
				<Design.TextInput
					label="Paste lists (one per line, like  a: 🅰 🇦 )"
					placeholder={'a: 🅰 🇦\nfuck: 🍆 🍑'}
					size="md"
					value={listText}
					onChange={setListText}
					multiline
				/>
				<Design.Button
					text="Apply lists"
					variant="secondary"
					disabled={!listText.trim()}
					onPress={applyLists}
				/>
			</Design.Stack>
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
