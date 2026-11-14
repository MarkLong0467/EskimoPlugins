/**
 * Finds plugins that are copies of each other.
 *
 * Two plugins are compared by the same code (same SHA-256), by how much of their text is the same, by their names and
 * ids, and by how they describe themselves. A copy is not always bad: an old and a new version of a plugin installed
 * from two places is the usual cause, and both then patch the same parts of Discord, which can break one or both.
 *
 * A plugin can also do what an option of another plugin does (Favorite Anything, and Media Utils' option to favourite
 * anything): its name or its description is matched against the texts in the other plugin's code, where the labels and
 * explanations of its settings are.
 */

import type { DuplicateGroup, PluginScan } from './types'

/** What is compared about one plugin. */
export interface DuplicateInput {
	scan: PluginScan
	/** The text strings in the plugin's code. Empty when there is no code. */
	strings: ReadonlySet<string>
	/** The texts with words in the plugin's code (the labels and explanations of its settings), from `phrasesOf`. */
	phrases?: ReadonlySet<string>
}

/** The shortest and longest text that can be the label or the explanation of an option. */
const MIN_PHRASE = 8
const MAX_PHRASE = 220

/** The most option texts kept from one plugin. */
const MAX_PHRASES = 3000

/** The texts with at least two words in some code: the labels and explanations of its settings among them. */
export function phrasesOf(source: string): Set<string> {
	const out = new Set<string>()
	const quoted = /(["'`])((?:\\.|(?!\1)[^\\\n]){8,220})\1/g
	for (const match of source.matchAll(quoted)) {
		const text = match[2]
		if (
			text &&
			text.length >= MIN_PHRASE &&
			text.length <= MAX_PHRASE &&
			/[A-Za-z]{2,}[,.]? +[A-Za-z]{2,}/.test(text) &&
			!/[{}<>=;]|\$\{|https?:/.test(text) &&
			// Not a log line ([plugin] ...), a message that something is loading (it ends in ...) or a heading in capitals.
			!/^\s*\[/.test(text) &&
			!/(?:\.\.\.|…)\s*$/.test(text) &&
			text !== text.toUpperCase()
		)
			out.add(text)
		if (out.size >= MAX_PHRASES) break
	}
	return out
}

/** A text in lower case with single spaces between its words, and a space at each end, for whole-word matching. */
const spaced = (text: string) =>
	` ${text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()} `

/** Strings of at least this many characters count as part of the plugin's fingerprint. */
const MIN_STRING = 6

/** The longest string in a fingerprint. */
const MAX_STRING = 80

/** The most strings in a fingerprint. */
const MAX_STRINGS = 6000

/** A string in at least this share of plugins is common to all and says nothing. */
const COMMON_SHARE = 0.4

/** Plugins needed before the common-string filter can tell what is common. */
const COMMON_MIN_PLUGINS = 5

/** A fingerprint needs this many strings to be compared. */
const MIN_FINGERPRINT = 12

/** At this similarity, two plugins are taken for copies of each other. */
const NEAR_COPY = 0.8

/** At this similarity, two plugins share a lot of code. */
const SHARED_CODE = 0.55

/** The text strings in some code. */
export function stringsOf(source: string): Set<string> {
	const out = new Set<string>()
	const quoted = /(["'`])((?:\\.|(?!\1)[^\\\n]){6,80})\1/g
	for (const match of source.matchAll(quoted)) {
		const text = match[2]
		if (text && text.length >= MIN_STRING && text.length <= MAX_STRING)
			out.add(text)
		if (out.size >= MAX_STRINGS) break
	}
	return out
}

/** A name with the words every plugin has and the punctuation taken out. */
export function plainName(name: string): string {
	return name
		.toLowerCase()
		.replace(/\b(?:plugin|plugins|for|discord|revenge|valenced|the|by)\b/g, '')
		.replace(/[^a-z0-9]/g, '')
}

/** The part of a plugin id after the author's name: `marklong.server-info` gives `server-info`. */
function idTail(id: string): string {
	const dot = id.indexOf('.')
	return dot >= 0 ? id.slice(dot + 1).toLowerCase() : id.toLowerCase()
}

/** The meaningful words of a description. */
function wordsOf(text: string): Set<string> {
	const stop = new Set([
		'with',
		'that',
		'this',
		'from',
		'your',
		'what',
		'when',
		'into',
		'them',
		'they',
		'have',
		'will',
		'lets',
		'adds',
		'show',
		'shows',
		'tap',
		'and',
		'the',
	])
	const out = new Set<string>()
	for (const word of text.toLowerCase().match(/[a-z]{4,}/g) ?? [])
		if (!stop.has(word)) out.add(word)
	return out
}

/** How much two sets overlap, from 0 (nothing) to 1 (the same). */
export function jaccard(
	a: ReadonlySet<string>,
	b: ReadonlySet<string>,
): number {
	if (a.size === 0 || b.size === 0) return 0
	const [small, large] = a.size <= b.size ? [a, b] : [b, a]
	let shared = 0
	for (const item of small) if (large.has(item)) shared++
	return shared / (a.size + b.size - shared)
}

/** The strings every plugin has, which would make unrelated plugins look alike. */
function commonStrings(inputs: readonly DuplicateInput[]): Set<string> {
	const common = new Set<string>()
	if (inputs.length < COMMON_MIN_PLUGINS) return common
	const counts = new Map<string, number>()
	for (const input of inputs)
		for (const text of input.strings)
			counts.set(text, (counts.get(text) ?? 0) + 1)
	for (const [text, count] of counts)
		if (count / inputs.length >= COMMON_SHARE) common.add(text)
	return common
}

/** One option text of a plugin, ready to compare. */
interface Phrase {
	text: string
	spaced: string
	words: Set<string>
}

/** The option texts of each plugin, without those most plugins have. */
function phraseLists(inputs: readonly DuplicateInput[]): Phrase[][] {
	const lists = inputs.map(input => [...(input.phrases ?? input.strings)])
	const counts = new Map<string, number>()
	for (const list of lists)
		for (const text of list) counts.set(text, (counts.get(text) ?? 0) + 1)
	const common = (text: string) =>
		inputs.length >= COMMON_MIN_PLUGINS &&
		(counts.get(text) ?? 0) / inputs.length >= COMMON_SHARE
	return lists.map(list =>
		list
			.filter(text => !common(text))
			.map(text => ({ text, spaced: spaced(text), words: jobWordsOf(text) })),
	)
}

/** Words left out of a plugin's name before it is looked for. */
const NAME_FILLER = new Set([
	'plugin',
	'plugins',
	'for',
	'discord',
	'revenge',
	'valenced',
	'the',
	'by',
	'a',
	'an',
])

/** A plugin's name to look for in the options of others. */
interface NameToFind {
	/** The name as words, from `spaced`. */
	words: string
	/** The name as it is written. A text with it written that way names the plugin (a note about it), not an option. */
	written: string
}

/** A plugin's name to look for, or nothing if it is too short or plain to mean anything alone. */
function nameToFind(name: string): NameToFind | undefined {
	const words = spaced(name.replace(/([a-z])([A-Z])/g, '$1 $2'))
		.trim()
		.split(' ')
		.filter(word => word && !NAME_FILLER.has(word))
	const plain = words.join(' ')
	return words.length >= 2 && plain.length >= 8
		? { words: ` ${plain} `, written: name.trim() }
		: undefined
}

/** Words too common in plugin texts to say that an option does the same job as a plugin. */
const GENERIC = new Set([
	'discord',
	'plugin',
	'plugins',
	'option',
	'options',
	'setting',
	'settings',
	'button',
	'open',
	'opens',
	'turn',
	'also',
	'more',
	'only',
	'which',
	'still',
	'each',
	'every',
	'other',
	'their',
	'like',
	'list',
	'here',
	'just',
	'than',
	'then',
	'there',
	'these',
	'those',
	'make',
	'makes',
	'using',
	'used',
	'uses',
])

/** The words of a text that can say what it does, without a final s (so "hides" and "hide" are one word). */
const jobWordsOf = (text: string) => {
	const out = new Set<string>()
	for (const word of wordsOf(text))
		if (!GENERIC.has(word)) out.add(word.replace(/s$/, ''))
	return out
}

/** Option texts no longer than this many words can be the label of a switch with the other plugin's name in it. */
const LABEL_WORDS = 8

/** Words that must be shared, and the share of the option's words, for an option to describe the same thing. */
const SAME_JOB_WORDS = 4
const SAME_JOB_SHARE = 0.75

/** An option text with more meaningful words than this is an explanation of something else, not one option. */
const SAME_JOB_MAX_WORDS = 16

/**
 * The option of another plugin that does what a plugin does, or nothing. An option counts when its text has the plugin's
 * name in it (a short label such as "Favorite anything"), or when most of its meaningful words are in the plugin's
 * description.
 */
function optionLike(
	name: NameToFind | undefined,
	description: ReadonlySet<string>,
	options: readonly Phrase[],
): { text: string; byName: boolean } | undefined {
	if (name)
		for (const option of options)
			if (
				option.spaced.includes(name.words) &&
				!option.text.includes(name.written) &&
				option.spaced.trim().split(' ').length <= LABEL_WORDS
			)
				return { text: option.text, byName: true }
	if (description.size < SAME_JOB_WORDS) return undefined
	let best: { text: string; share: number } | undefined
	for (const option of options) {
		if (
			option.words.size < SAME_JOB_WORDS ||
			option.words.size > SAME_JOB_MAX_WORDS
		)
			continue
		let shared = 0
		for (const word of option.words) if (description.has(word)) shared++
		const share = shared / option.words.size
		if (
			shared >= SAME_JOB_WORDS &&
			share >= SAME_JOB_SHARE &&
			share > (best?.share ?? 0)
		)
			best = { text: option.text, share }
	}
	return best && { text: best.text, byName: false }
}

/** An option text short enough to show in a chip. */
const short = (text: string) =>
	text.length > 60 ? `${text.slice(0, 57).trimEnd()}...` : text

type Confidence = DuplicateGroup['confidence']

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

/** One pair of plugins and why they look alike. */
interface Pair {
	a: number
	b: number
	reasons: { text: string; confidence: Confidence }[]
	similarity: number | null
	overlaps: NonNullable<DuplicateGroup['overlaps']>
}

/**
 * Finds groups of plugins that look like the same thing.
 *
 * @param inputs The scanned plugins with their text strings.
 * @returns Groups of two or more plugins, the surest first.
 */
export function findDuplicates(
	inputs: readonly DuplicateInput[],
): DuplicateGroup[] {
	const common = commonStrings(inputs)
	const prints = inputs.map(input => {
		const own = new Set<string>()
		for (const text of input.strings)
			if (!common.has(text) && !text.startsWith('valenced.')) own.add(text)
		return own
	})
	const names = inputs.map(i => plainName(i.scan.plugin.name))
	const tails = inputs.map(i => idTail(i.scan.plugin.id))
	const words = inputs.map(i => wordsOf(i.scan.plugin.description))
	const options = phraseLists(inputs)
	const toFind = inputs.map(i => nameToFind(i.scan.plugin.name))
	const jobWords = inputs.map(i => jobWordsOf(i.scan.plugin.description))

	const pairs: Pair[] = []
	for (let a = 0; a < inputs.length; a++) {
		for (let b = a + 1; b < inputs.length; b++) {
			const left = inputs[a]?.scan
			const right = inputs[b]?.scan
			if (!left || !right) continue
			const reasons: Pair['reasons'] = []
			const overlaps: Pair['overlaps'] = []
			let similarity: number | null = null

			if (left.sha256 && left.sha256 === right.sha256)
				reasons.push({ text: 'Identical code', confidence: 'high' })

			const pa = prints[a] as Set<string>
			const pb = prints[b] as Set<string>
			if (
				!(left.sha256 && left.sha256 === right.sha256) &&
				pa.size >= MIN_FINGERPRINT &&
				pb.size >= MIN_FINGERPRINT
			) {
				similarity = jaccard(pa, pb)
				if (similarity >= NEAR_COPY)
					reasons.push({
						text: `Nearly the same code (${Math.round(similarity * 100)}%)`,
						confidence: 'high',
					})
				else if (similarity >= SHARED_CODE)
					reasons.push({
						text: `Shares a lot of code (${Math.round(similarity * 100)}%)`,
						confidence: 'low',
					})
			} else if (left.sha256 && left.sha256 === right.sha256) {
				similarity = 1
			}

			const na = names[a] as string
			const nb = names[b] as string
			if (na.length >= 3 && na === nb)
				reasons.push({ text: 'Same name', confidence: 'medium' })
			else if (
				Math.min(na.length, nb.length) >= 6 &&
				(na.includes(nb) || nb.includes(na))
			)
				reasons.push({ text: 'Similar name', confidence: 'low' })

			if (tails[a] === tails[b] && left.plugin.id !== right.plugin.id)
				reasons.push({
					text: 'Same plugin id from a different author',
					confidence: 'medium',
				})

			const wa = words[a] as Set<string>
			const wb = words[b] as Set<string>
			if (wa.size >= 5 && wb.size >= 5 && jaccard(wa, wb) >= 0.6)
				reasons.push({
					text: 'Describes itself the same way',
					confidence: 'low',
				})

			// Does one of them do what an option of the other does? Not asked of copies: they have all the same texts.
			if (!reasons.some(r => r.confidence === 'high'))
				for (const [one, other] of [
					[a, b],
					[b, a],
				] as const) {
					const found = optionLike(
						toFind[one],
						jobWords[one] as Set<string>,
						options[other] as Phrase[],
					)
					if (!found) continue
					const oneScan = (inputs[one] as DuplicateInput).scan
					const otherScan = (inputs[other] as DuplicateInput).scan
					overlaps.push({
						plugin: oneScan.plugin.id,
						by: otherScan.plugin.id,
						option: found.text,
					})
					reasons.push({
						text: `${otherScan.plugin.name} has an option for this: "${short(found.text)}"`,
						confidence: found.byName ? 'medium' : 'low',
					})
				}

			if (reasons.length > 0)
				pairs.push({ a, b, reasons, similarity, overlaps })
		}
	}

	// A pair found only by an option that does the same job is a group of its own: such pairs would otherwise chain
	// unrelated plugins together (A has an option like B, B one like C).
	const onlyOptions = (pair: Pair) =>
		pair.overlaps.length > 0 && pair.reasons.length === pair.overlaps.length
	const optionPairs = pairs.filter(onlyOptions)
	const copyPairs = pairs.filter(pair => !onlyOptions(pair))

	// Plugins are joined into a group when any pair between them has a reason.
	const parent = inputs.map((_, i) => i)
	const find = (i: number): number => {
		let root = i
		while (parent[root] !== root) root = parent[root] as number
		return root
	}
	for (const pair of copyPairs) parent[find(pair.a)] = find(pair.b)

	const groups = new Map<number, Pair[]>()
	for (const pair of copyPairs) {
		const root = find(pair.a)
		groups.set(root, [...(groups.get(root) ?? []), pair])
	}
	const all = [...groups.values(), ...optionPairs.map(pair => [pair])]

	const out: DuplicateGroup[] = []
	for (const group of all) {
		const members = new Set<string>()
		const reasons = new Set<string>()
		const overlaps: Pair['overlaps'] = []
		let confidence: Confidence = 'low'
		let similarity: number | null = null
		for (const pair of group) {
			members.add((inputs[pair.a] as DuplicateInput).scan.plugin.id)
			members.add((inputs[pair.b] as DuplicateInput).scan.plugin.id)
			// Weak reasons (a similar name, a similar description) stay weak however many there are: sibling plugins from
			// one author, such as Valenced's three theme plugins, have both.
			const best = pair.reasons.reduce<Confidence>(
				(top, r) => (RANK[r.confidence] > RANK[top] ? r.confidence : top),
				'low',
			)
			if (RANK[best] > RANK[confidence]) confidence = best
			for (const r of pair.reasons) reasons.add(r.text)
			overlaps.push(...pair.overlaps)
			if (pair.similarity !== null)
				similarity = Math.max(similarity ?? 0, pair.similarity)
		}
		out.push({
			members: [...members],
			reasons: [...reasons],
			confidence,
			similarity,
			...(overlaps.length > 0 ? { overlaps } : {}),
		})
	}
	return out.sort(
		(x, y) =>
			RANK[y.confidence] - RANK[x.confidence] ||
			y.members.length - x.members.length,
	)
}
