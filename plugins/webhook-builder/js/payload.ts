/**
 * Turns the message being made into what Discord's API takes, checks it against Discord's limits, and turns messages
 * from Discord, from Discohook and from this plugin back into one the editor can hold.
 */

import { emptyDraft, emptyEmbed, emptyPoll, LIMITS } from './constants'
import { cleanDraft } from './state'
import { fill } from './variables'
import type {
	ApiComponent,
	ApiEmbed,
	ApiMessage,
	Draft,
	Embed,
	LinkButton,
} from './types'

const FLAG_SUPPRESS_EMBEDS = 1 << 2
const FLAG_SILENT = 1 << 12

/** Whether a text is a web link Discord takes for a picture or a link. */
export function isUrl(value: string): boolean {
	return /^https?:\/\/\S+$/i.test(value.trim())
}

/** A colour typed as `#5865f2`, `5865f2` or `#fff`, as a number. Nothing for something else. */
export function colorNumber(value: string): number | undefined {
	let hex = value.trim().replace(/^#/, '')
	if (/^[0-9a-f]{3}$/i.test(hex))
		hex = hex
			.split('')
			.map(c => c + c)
			.join('')
	return /^[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex, 16) : undefined
}

/** A colour number as `#rrggbb`. */
export function colorHex(value: number): string {
	return `#${Math.max(0, Math.min(0xffffff, value)).toString(16).padStart(6, '0')}`
}

/** An emoji as typed (`🔥`, `<:name:123>` or `<a:name:123>`) as Discord's API takes it. */
function emojiOf(
	value: string,
): { name?: string; id?: string; animated?: boolean } | undefined {
	const text = value.trim()
	if (!text) return undefined
	const custom = text.match(/^<(a?):(\w+):(\d+)>$/)
	if (custom)
		return { name: custom[2], id: custom[3], animated: custom[1] === 'a' }
	return { name: text }
}

/** An emoji from Discord's API as it is typed. */
function emojiText(emoji: ApiComponent['emoji']): string {
	if (!emoji) return ''
	return emoji.id
		? `<:${emoji.name ?? 'emoji'}:${emoji.id}>`
		: (emoji.name ?? '')
}

/** How many characters of an embed count towards the limit of all the embeds of a message. */
export function embedLength(embed: Embed): number {
	return (
		embed.title.length +
		embed.description.length +
		embed.authorName.length +
		embed.footerText.length +
		embed.fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0)
	)
}

/** Whether an embed has nothing in it that Discord would show. */
function embedIsEmpty(embed: Embed): boolean {
	return (
		!embed.title.trim() &&
		!embed.description.trim() &&
		!embed.authorName.trim() &&
		!embed.footerText.trim() &&
		!embed.image.trim() &&
		!embed.thumbnail.trim() &&
		embed.fields.length === 0
	)
}

/** How many embeds a message really sends: its own and one for each extra picture of a gallery. */
export function embedCount(draft: Draft): number {
	return draft.embeds.reduce(
		(sum, e) =>
			sum + 1 + (e.url.trim() ? e.gallery.filter(g => g.trim()).length : 0),
		0,
	)
}

/** What is wrong with a message, so Discord would refuse it. Empty when it can be sent. */
export function problems(
	draft: Draft,
	mode: 'send' | 'edit' = 'send',
): string[] {
	const out: string[] = []
	const tooLong = (what: string, value: string, max: number) => {
		if (value.length > max)
			out.push(`${what} is ${value.length} characters, the most is ${max}`)
	}
	const badUrl = (what: string, value: string) => {
		if (value.trim() && !isUrl(value))
			out.push(`${what} must be a link that starts with https://`)
	}
	if (
		!draft.content.trim() &&
		draft.embeds.length === 0 &&
		!draft.poll &&
		draft.buttons.length === 0
	)
		out.push('The message is empty: write something or add an embed or a poll')
	if (
		draft.buttons.length > 0 &&
		!draft.content.trim() &&
		draft.embeds.length === 0 &&
		!draft.poll
	)
		out.push('Buttons need some text or an embed with them')
	tooLong('The text', draft.content, LIMITS.content)
	tooLong('The name', draft.username, LIMITS.username)
	if (/clyde|discord/i.test(draft.username))
		out.push('Discord does not allow "clyde" or "discord" in the name')
	badUrl('The avatar', draft.avatarUrl)
	if (embedCount(draft) > LIMITS.embeds)
		out.push(
			`A message can have ${LIMITS.embeds} embeds, gallery pictures included (this one has ${embedCount(draft)})`,
		)
	let total = 0
	draft.embeds.forEach((embed, index) => {
		const name = `Embed ${index + 1}`
		total += embedLength(embed)
		if (embedIsEmpty(embed)) out.push(`${name} is empty`)
		tooLong(`${name}'s title`, embed.title, LIMITS.title)
		tooLong(`${name}'s description`, embed.description, LIMITS.description)
		tooLong(`${name}'s author`, embed.authorName, LIMITS.author)
		tooLong(`${name}'s footer`, embed.footerText, LIMITS.footer)
		if (embed.fields.length > LIMITS.fields)
			out.push(`${name} has more than ${LIMITS.fields} fields`)
		embed.fields.forEach((field, i) => {
			if (!field.name.trim() || !field.value.trim())
				out.push(`${name}, field ${i + 1} needs a name and a value`)
			tooLong(`${name}, field ${i + 1}'s name`, field.name, LIMITS.fieldName)
			tooLong(`${name}, field ${i + 1}'s value`, field.value, LIMITS.fieldValue)
		})
		badUrl(`${name}'s title link`, embed.url)
		badUrl(`${name}'s author link`, embed.authorUrl)
		badUrl(`${name}'s author icon`, embed.authorIcon)
		badUrl(`${name}'s footer icon`, embed.footerIcon)
		badUrl(`${name}'s picture`, embed.image)
		badUrl(`${name}'s thumbnail`, embed.thumbnail)
		embed.gallery.forEach((g, i) =>
			badUrl(`${name}'s gallery picture ${i + 1}`, g),
		)
		if (embed.gallery.some(g => g.trim()) && !embed.url.trim())
			out.push(
				`${name}'s gallery needs a title link: Discord groups the pictures by it`,
			)
		if (embed.color.trim() && colorNumber(embed.color) === undefined)
			out.push(`${name}'s colour must look like #5865f2`)
		if (embed.footerIcon.trim() && !embed.footerText.trim())
			out.push(`${name}'s footer icon needs footer text`)
		if (embed.authorIcon.trim() && !embed.authorName.trim())
			out.push(`${name}'s author icon needs an author name`)
	})
	if (total > LIMITS.embedTotal)
		out.push(
			`The embeds have ${total} characters together, the most is ${LIMITS.embedTotal}`,
		)
	if (draft.buttons.length > LIMITS.buttonRows)
		out.push(`A message can have ${LIMITS.buttonRows} rows of buttons`)
	draft.buttons.forEach((row, r) => {
		if (row.length > LIMITS.buttonsPerRow)
			out.push(
				`Button row ${r + 1} has more than ${LIMITS.buttonsPerRow} buttons`,
			)
		row.forEach((button, b) => {
			const name = `Button ${b + 1} of row ${r + 1}`
			if (!button.label.trim() && !button.emoji.trim())
				out.push(`${name} needs a label or an emoji`)
			tooLong(`${name}'s label`, button.label, LIMITS.buttonLabel)
			if (!/^(https?|discord):\/\/\S+$/i.test(button.url.trim()))
				out.push(`${name} needs a link`)
		})
	})
	if (draft.poll && mode === 'send') {
		const poll = draft.poll
		if (!poll.question.trim()) out.push('The poll needs a question')
		tooLong('The poll question', poll.question, LIMITS.pollQuestion)
		const answers = poll.answers.filter(a => a.trim())
		if (answers.length === 0) out.push('The poll needs at least one answer')
		if (poll.answers.length > LIMITS.pollAnswers)
			out.push(`A poll can have ${LIMITS.pollAnswers} answers`)
		poll.answers.forEach((a, i) =>
			tooLong(`Poll answer ${i + 1}`, a, LIMITS.pollAnswer),
		)
		if (poll.hours < 1 || poll.hours > LIMITS.pollHours)
			out.push(`A poll lasts 1 to ${LIMITS.pollHours} hours`)
	}
	tooLong('The post title', draft.threadName, LIMITS.threadName)
	if (draft.threadId.trim() && !/^\d{15,22}$/.test(draft.threadId.trim()))
		out.push('The thread must be its id (a long number)')
	return out
}

/** One embed as Discord's API takes it, with the words filled in. Its gallery comes after it as more embeds. */
function apiEmbeds(
	embed: Embed,
	put: (text: string) => string,
	now: number,
): ApiEmbed[] {
	const out: Record<string, unknown> = {}
	const set = (key: string, value: unknown) => {
		if (value !== undefined && value !== '') out[key] = value
	}
	set('title', put(embed.title))
	set('url', embed.url.trim())
	set('description', put(embed.description))
	set('color', colorNumber(embed.color))
	if (embed.authorName.trim())
		out.author = {
			name: put(embed.authorName),
			...(embed.authorUrl.trim() ? { url: embed.authorUrl.trim() } : {}),
			...(embed.authorIcon.trim() ? { icon_url: embed.authorIcon.trim() } : {}),
		}
	if (embed.footerText.trim())
		out.footer = {
			text: put(embed.footerText),
			...(embed.footerIcon.trim() ? { icon_url: embed.footerIcon.trim() } : {}),
		}
	if (embed.image.trim()) out.image = { url: embed.image.trim() }
	if (embed.thumbnail.trim()) out.thumbnail = { url: embed.thumbnail.trim() }
	if (embed.timestampMode === 'sent')
		out.timestamp = new Date(now).toISOString()
	else if (embed.timestampMode === 'fixed' && embed.timestamp > 0)
		out.timestamp = new Date(embed.timestamp).toISOString()
	if (embed.fields.length)
		out.fields = embed.fields.map(f => ({
			name: put(f.name),
			value: put(f.value),
			inline: f.inline,
		}))
	const url = embed.url.trim()
	const gallery = url
		? embed.gallery
				.filter(g => g.trim())
				.map(g => ({ url, image: { url: g.trim() } }))
		: []
	return [out as ApiEmbed, ...gallery]
}

/** The link buttons as Discord's API takes them. */
function apiComponents(
	rows: LinkButton[][],
	put: (text: string) => string,
): ApiComponent[] {
	return rows
		.filter(row => row.length > 0)
		.map(row => ({
			type: 1,
			components: row.map(b => {
				const emoji = emojiOf(b.emoji)
				return {
					type: 2,
					style: 5,
					url: b.url.trim(),
					...(b.label.trim() ? { label: put(b.label) } : {}),
					...(emoji ? { emoji } : {}),
				} as ApiComponent
			}),
		}))
}

/**
 * The message as Discord's API takes it.
 *
 * @param mode `send` for a new message, `edit` for a change to a message that was sent: a change cannot have a name, an
 * avatar, a poll or a thread of its own, and every part is sent so a part that was removed goes.
 */
export function toPayload(
	draft: Draft,
	options: { mode?: 'send' | 'edit'; now?: number; webhook?: string } = {},
): Record<string, unknown> {
	const mode = options.mode ?? 'send'
	const now = options.now ?? Date.now()
	const put = (text: string) => fill(text, { now, webhook: options.webhook })
	const body: Record<string, unknown> = {}
	const content = put(draft.content)
	if (content || mode === 'edit') body.content = content
	const embeds = draft.embeds.flatMap(e => apiEmbeds(e, put, now))
	if (embeds.length || mode === 'edit') body.embeds = embeds
	const components = apiComponents(draft.buttons, put)
	if (components.length || mode === 'edit') body.components = components
	body.allowed_mentions =
		draft.mentions === 'all'
			? { parse: ['users', 'roles', 'everyone'] }
			: { parse: draft.mentions === 'users' ? ['users'] : [] }
	let flags = 0
	if (draft.suppressEmbeds) flags |= FLAG_SUPPRESS_EMBEDS
	if (mode === 'send') {
		if (draft.silent) flags |= FLAG_SILENT
		if (draft.username.trim()) body.username = put(draft.username.trim())
		if (draft.avatarUrl.trim()) body.avatar_url = draft.avatarUrl.trim()
		if (draft.tts) body.tts = true
		if (draft.threadName.trim() && !draft.threadId.trim())
			body.thread_name = put(draft.threadName.trim())
		if (draft.poll)
			body.poll = {
				question: { text: put(draft.poll.question) },
				answers: draft.poll.answers
					.filter(a => a.trim())
					.map(a => ({ poll_media: { text: put(a) } })),
				duration: Math.round(draft.poll.hours),
				allow_multiselect: draft.poll.multiselect,
				layout_type: 1,
			}
	}
	if (flags || mode === 'edit') body.flags = flags
	return body
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')

/** A colour from Discord: a number from its API, or `#rrggbb` as Discord's app keeps it. */
function colorFrom(value: unknown): string {
	if (typeof value === 'number' && Number.isFinite(value))
		return colorHex(value)
	if (typeof value === 'string' && colorNumber(value) !== undefined)
		return colorHex(colorNumber(value) as number)
	return ''
}

/** An embed from Discord's API (or from Discord's app, which renames some parts) as the editor holds it. */
export function embedFrom(api: ApiEmbed): Embed {
	const embed = emptyEmbed()
	embed.title = str(api.title) || str(api.rawTitle)
	embed.url = str(api.url)
	embed.description = str(api.description) || str(api.rawDescription)
	embed.color = colorFrom(api.color)
	embed.authorName = str(api.author?.name)
	embed.authorUrl = str(api.author?.url)
	embed.authorIcon = str(api.author?.icon_url) || str(api.author?.iconURL)
	embed.footerText = str(api.footer?.text)
	embed.footerIcon = str(api.footer?.icon_url) || str(api.footer?.iconURL)
	embed.image = str(api.image?.url)
	embed.thumbnail = str(api.thumbnail?.url)
	const time = api.timestamp ? Date.parse(api.timestamp) : Number.NaN
	if (Number.isFinite(time)) {
		embed.timestampMode = 'fixed'
		embed.timestamp = time
	}
	embed.fields = (api.fields ?? []).map(f => ({
		name: str(f.name) || str(f.rawName),
		value: str(f.value) || str(f.rawValue),
		inline: !!f.inline,
	}))
	return embed
}

/** Embeds from Discord, with the pictures of a gallery (embeds with the same link and only a picture) put back together. */
function embedsFrom(list: ApiEmbed[] | undefined): Embed[] {
	const out: Embed[] = []
	for (const api of list ?? []) {
		// Discord adds previews of links by itself; only the embeds that were sent are kept.
		if (api.type && api.type !== 'rich') continue
		const last = out.at(-1)
		const onlyPicture =
			api.image?.url &&
			!api.title &&
			!api.description &&
			!api.fields?.length &&
			!api.author &&
			!api.footer
		if (
			last &&
			onlyPicture &&
			api.url &&
			api.url === last.url &&
			last.gallery.length < LIMITS.gallery
		) {
			last.gallery.push(str(api.image?.url))
			continue
		}
		out.push(embedFrom(api))
	}
	return out
}

/** Link buttons from Discord's API. Other components cannot be sent by a webhook, so they are left out. */
function buttonsFrom(list: ApiComponent[] | undefined): LinkButton[][] {
	return (list ?? [])
		.filter(row => row?.type === 1)
		.map(row =>
			(row.components ?? [])
				.filter(c => c.type === 2 && c.style === 5 && c.url)
				.map(c => ({
					label: str(c.label),
					url: str(c.url),
					emoji: emojiText(c.emoji),
				})),
		)
		.filter(row => row.length > 0)
}

/**
 * A message from Discord's API, or a message in the shape Discord's API takes (as Discohook and other tools save it),
 * as the editor holds it.
 */
export function draftFrom(
	message: ApiMessage | Record<string, unknown>,
): Draft {
	const m = message as ApiMessage & Record<string, unknown>
	const draft = emptyDraft()
	draft.content = str(m.content)
	draft.embeds = embedsFrom(m.embeds)
	draft.buttons = buttonsFrom(m.components)
	draft.username =
		str(m.username) || (m.webhook_id ? str(m.author?.username) : '')
	draft.avatarUrl = str(m.avatar_url)
	if (!draft.avatarUrl && m.webhook_id && m.author?.id && m.author.avatar)
		draft.avatarUrl = `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
	draft.tts = m.tts === true
	draft.threadName = str(m.thread_name)
	const flags = Number(m.flags) || 0
	draft.suppressEmbeds = (flags & FLAG_SUPPRESS_EMBEDS) !== 0
	draft.silent = (flags & FLAG_SILENT) !== 0
	const mentions = m.allowed_mentions as { parse?: string[] } | undefined
	if (mentions && Array.isArray(mentions.parse))
		draft.mentions = mentions.parse.includes('everyone')
			? 'all'
			: mentions.parse.includes('users')
				? 'users'
				: 'none'
	if (m.poll) {
		const poll = emptyPoll()
		const raw = m.poll as Record<string, unknown> &
			NonNullable<ApiMessage['poll']>
		poll.question = str(raw.question?.text)
		poll.answers = (raw.answers ?? []).map(a => str(a.poll_media?.text))
		poll.multiselect = !!raw.allow_multiselect
		if (typeof raw.duration === 'number') poll.hours = raw.duration
		draft.poll = poll
	}
	return draft
}

/** A message ready to be saved as JSON, in the shape Discohook shares messages in. */
export function exportDraft(draft: Draft): string {
	return JSON.stringify(
		{ messages: [{ data: toPayload(draft, { now: 0 }) }] },
		null,
		2,
	)
}

/** Every saved message as one JSON text, in the shape of a Discohook backup. */
export function exportAll(saved: { name: string; draft: Draft }[]): string {
	return JSON.stringify(
		{
			version: 1,
			source: 'Webhook Builder',
			backups: saved.map(s => ({
				name: s.name,
				messages: [
					{ data: toPayload(s.draft, { now: 0 }), editor: cleanDraft(s.draft) },
				],
			})),
		},
		null,
		2,
	)
}

/** A message found in pasted JSON, with a name if it had one. */
export interface Found {
	name: string
	draft: Draft
}

/** A message of a Discohook backup or share: this plugin's own editor copy if it is there, otherwise its data. */
function fromEntry(entry: Record<string, unknown>): Draft | null {
	if (entry.editor && typeof entry.editor === 'object')
		return cleanDraft(entry.editor as Partial<Draft>)
	const data = (entry.data ?? entry) as Record<string, unknown>
	return data && typeof data === 'object' ? draftFrom(data) : null
}

/**
 * The messages in a pasted text. Takes a Discohook backup (`backups`), a Discohook share (`messages`), a list of messages,
 * or one message as Discord's API takes or gives it. Also takes a discohook.org link with the message in it.
 *
 * @throws When the text is not JSON or has no message in it.
 */
export function importText(text: string): Found[] {
	let source = text.trim()
	const link = source.match(/[?&#]data=([^&\s]+)/)
	if (link?.[1]) source = decodeShare(link[1])
	let parsed: unknown
	try {
		parsed = JSON.parse(source)
	} catch {
		throw new Error(
			'That is not JSON. Copy the JSON of a message (Discohook: Options → JSON Data Editor)',
		)
	}
	const found: Found[] = []
	const take = (value: unknown, name: string) => {
		if (!value || typeof value !== 'object') return
		const v = value as Record<string, unknown>
		if (Array.isArray(v.backups)) {
			v.backups.forEach((b: Record<string, unknown>, i: number) =>
				take({ messages: b?.messages }, str(b?.name) || `${name} ${i + 1}`),
			)
			return
		}
		if (Array.isArray(v.messages)) {
			const messages = v.messages as Record<string, unknown>[]
			messages.forEach((m: Record<string, unknown>, i: number) => {
				const draft = fromEntry(m)
				if (draft)
					found.push({
						name: messages.length > 1 ? `${name} (${i + 1})` : name,
						draft,
					})
			})
			return
		}
		if (Array.isArray(value)) {
			value.forEach((m, i) => take(m, `${name} ${i + 1}`))
			return
		}
		if ('content' in v || 'embeds' in v || 'poll' in v || 'components' in v)
			found.push({ name, draft: draftFrom(v) })
	}
	take(parsed, 'Imported message')
	if (found.length === 0) throw new Error('No message found in that JSON')
	return found
}

/** The message in a Discohook share link: base64 of the JSON. */
function decodeShare(encoded: string): string {
	const base64 = decodeURIComponent(encoded)
		.replace(/-/g, '+')
		.replace(/_/g, '/')
	const decode = (globalThis as { atob?: (s: string) => string }).atob
	if (!decode)
		throw new Error(
			'This phone cannot read share links. Paste the JSON instead',
		)
	const bytes = decode(base64)
	try {
		return decodeURIComponent(
			bytes
				.split('')
				.map(c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
				.join(''),
		)
	} catch {
		return bytes
	}
}

/** A short line that says what a message is. */
export function previewOf(draft: Draft): string {
	const line = (text: string) => text.replace(/\s+/g, ' ').trim()
	const first =
		line(draft.content) ||
		line(draft.embeds[0]?.title ?? '') ||
		line(draft.embeds[0]?.description ?? '') ||
		line(draft.poll?.question ?? '') ||
		(draft.embeds.length ? 'An embed' : 'A message')
	return first.length > 80 ? `${first.slice(0, 80)}…` : first
}
