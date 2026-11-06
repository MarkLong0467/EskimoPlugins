import { looksLikeEmoji, MAX_CUSTOM_WORDS, makeCustomWord } from './custom'
import type { CustomWord, TextReactSettings } from './types'

/** Names the exported file so it can be told from other JSON. */
export const FORMAT = 'text-react-settings'

/** Pauses that can be chosen. Anything else in a file is ignored. */
const DELAYS = new Set(['0.5', '1', '2', '3'])

/** The settings as the text of a JSON file, for sharing. */
export function exportSettings(settings: TextReactSettings): string {
	const data = {
		format: FORMAT,
		version: 1,
		menu: settings.menu !== false,
		warn: settings.warn !== false,
		animate: settings.animate !== false,
		delaySeconds: String(settings.delaySeconds),
		customWords: settings.customWords ?? [],
		overrides: settings.overrides ?? {},
		hiddenDefaults: settings.hiddenDefaults ?? [],
	}
	return JSON.stringify(data, null, 2)
}

/**
 * Reads the text of a settings file.
 *
 * Only what is valid is taken: entries with a word and emoji, switches that are true or false, a pause from the list. A
 * wrong entry is skipped, and counted in `skipped`.
 *
 * @returns The settings found, or the reason the text is not a settings file.
 */
export function parseSettings(
	text: string,
): { settings: Partial<TextReactSettings>; skipped: number } | string {
	let data: Record<string, unknown>
	try {
		data = JSON.parse(text.trim())
	} catch {
		return 'That is not JSON'
	}
	if (
		!data ||
		typeof data !== 'object' ||
		Array.isArray(data) ||
		data.format !== FORMAT
	)
		return 'That is not a Text React settings file'

	const settings: Partial<TextReactSettings> = {}
	let skipped = 0
	for (const key of ['menu', 'warn', 'animate'] as const)
		if (typeof data[key] === 'boolean') settings[key] = data[key] as boolean
	if (typeof data.delaySeconds === 'string' && DELAYS.has(data.delaySeconds))
		settings.delaySeconds = data.delaySeconds

	if (Array.isArray(data.customWords)) {
		const byWord = new Map<string, CustomWord>()
		for (const entry of data.customWords as Array<{
			word?: unknown
			emoji?: unknown
		}>) {
			const made =
				typeof entry?.word === 'string' && typeof entry.emoji === 'string'
					? makeCustomWord(entry.word, entry.emoji)
					: 'bad'
			if (typeof made === 'string' || byWord.size >= MAX_CUSTOM_WORDS) skipped++
			else byWord.set(made.word, made)
		}
		settings.customWords = [...byWord.values()]
	}
	if (
		data.overrides &&
		typeof data.overrides === 'object' &&
		!Array.isArray(data.overrides)
	) {
		const lists: Record<string, string[]> = {}
		for (const [key, value] of Object.entries(
			data.overrides as Record<string, unknown>,
		)) {
			const emoji = Array.isArray(value)
				? value.filter(
						(item): item is string =>
							typeof item === 'string' && looksLikeEmoji(item),
					)
				: []
			if (key && key.length <= 20 && emoji.length)
				lists[key.toLowerCase()] = emoji.slice(0, 30)
			else skipped++
		}
		settings.overrides = lists
	}
	if (Array.isArray(data.hiddenDefaults))
		settings.hiddenDefaults = [
			...new Set(
				(data.hiddenDefaults as unknown[])
					.filter(
						(key): key is string =>
							typeof key === 'string' && key.length > 0 && key.length <= 20,
					)
					.map(key => key.toLowerCase()),
			),
		]
	return { settings, skipped }
}
