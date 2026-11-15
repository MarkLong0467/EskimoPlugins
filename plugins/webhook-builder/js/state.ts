/**
 * Everything the plugin keeps: webhooks, saved messages, sent messages, scheduled messages, the message being made and
 * the options. It is kept here and saved whole, so a part that was removed does not come back from the saved file.
 */

import {
	DEFAULT_OPTIONS,
	emptyDraft,
	emptyEmbed,
	emptyState,
	SENT_LIMIT,
} from './constants'
import type {
	Draft,
	Embed,
	LinkButton,
	Options,
	Poll,
	Saved,
	Scheduled,
	Sent,
	State,
	Webhook,
} from './types'

/** The plugin's JSON storage, handed over when the plugin starts and again when the settings screen opens. */
interface Storage {
	cache?: Partial<State>
	set(value: Partial<State>, replace?: boolean): unknown
}

let storage: Storage | undefined
let current: State | null = null
const listeners = new Set<() => void>()

const text = (value: unknown, fallback = ''): string =>
	typeof value === 'string' ? value : fallback
const list = <T>(value: unknown, check: (item: T) => boolean): T[] =>
	Array.isArray(value)
		? (value as T[]).filter(item => !!item && check(item))
		: []

/** An embed read from the saved file, with every part there. */
export function cleanEmbed(value: Partial<Embed>): Embed {
	const base = emptyEmbed(text(value.key) || undefined)
	return {
		...base,
		...Object.fromEntries(
			Object.entries(value).filter(
				([key, v]) => typeof v === typeof (base as never)[key],
			),
		),
		gallery: list<string>(value.gallery, g => typeof g === 'string'),
		fields: list<Embed['fields'][number]>(
			value.fields,
			f => typeof f === 'object',
		).map(f => ({
			name: text(f.name),
			value: text(f.value),
			inline: !!f.inline,
		})),
		timestampMode: ['none', 'sent', 'fixed'].includes(
			value.timestampMode as string,
		)
			? (value.timestampMode as Embed['timestampMode'])
			: 'none',
	} as Embed
}

/** A message read from the saved file (or pasted), with every part there. */
export function cleanDraft(value: Partial<Draft> | null | undefined): Draft {
	const base = emptyDraft()
	if (!value || typeof value !== 'object') return base
	const poll = value.poll as Partial<Poll> | null | undefined
	return {
		content: text(value.content),
		username: text(value.username),
		avatarUrl: text(value.avatarUrl),
		embeds: list<Partial<Embed>>(value.embeds, e => typeof e === 'object').map(
			cleanEmbed,
		),
		buttons: list<LinkButton[]>(value.buttons, row => Array.isArray(row))
			.map(row =>
				list<LinkButton>(row, b => typeof b === 'object').map(b => ({
					label: text(b.label),
					url: text(b.url),
					emoji: text(b.emoji),
				})),
			)
			.filter(row => row.length > 0),
		poll:
			poll && typeof poll === 'object'
				? {
						question: text(poll.question),
						answers: list<string>(poll.answers, a => typeof a === 'string'),
						hours: Number(poll.hours) > 0 ? Number(poll.hours) : 24,
						multiselect: !!poll.multiselect,
					}
				: null,
		threadId: text(value.threadId),
		threadName: text(value.threadName),
		silent: !!value.silent,
		suppressEmbeds: !!value.suppressEmbeds,
		tts: !!value.tts,
		mentions: ['all', 'users', 'none'].includes(value.mentions as string)
			? (value.mentions as Draft['mentions'])
			: base.mentions,
	}
}

/** Reads what was saved, keeping only what looks right. */
function read(saved: Partial<State> | undefined): State {
	const base = emptyState()
	if (!saved || typeof saved !== 'object') return base
	return {
		webhooks: list<Webhook>(
			saved.webhooks,
			w => typeof w.id === 'string' && typeof w.token === 'string',
		).map(w => ({
			...w,
			label: text(w.label, w.name || 'Webhook'),
			name: text(w.name),
			avatar: typeof w.avatar === 'string' ? w.avatar : null,
			channelId: typeof w.channelId === 'string' ? w.channelId : null,
			guildId: typeof w.guildId === 'string' ? w.guildId : null,
			addedAt: Number(w.addedAt) || 0,
		})),
		saved: list<Saved>(saved.saved, s => typeof s.id === 'string').map(s => ({
			id: s.id,
			name: text(s.name, 'Saved message'),
			draft: cleanDraft(s.draft),
			savedAt: Number(s.savedAt) || 0,
		})),
		sent: list<Sent>(
			saved.sent,
			s => typeof s.messageId === 'string' && typeof s.webhookId === 'string',
		),
		scheduled: list<Scheduled>(
			saved.scheduled,
			s => typeof s.id === 'string' && Number.isFinite(s.at),
		).map(s => ({
			...s,
			repeat: ['none', 'hourly', 'daily', 'weekly'].includes(s.repeat)
				? s.repeat
				: 'none',
			webhookIds: list<string>(s.webhookIds, id => typeof id === 'string'),
			draft: cleanDraft(s.draft),
			lastError: text(s.lastError),
		})),
		draft: cleanDraft(saved.draft),
		target: {
			webhookIds: list<string>(
				saved.target?.webhookIds,
				id => typeof id === 'string',
			),
			editing: text(saved.target?.editing),
		},
		options: { ...DEFAULT_OPTIONS, ...(saved.options ?? {}) } as Options,
	}
}

/** Remembers the storage to read from and save to. */
export function setStorage(next: unknown): void {
	if (storage === next) return
	storage = next as Storage
	current = null
}

/** Reads what was saved again. */
export function reload(): void {
	current = read(storage?.cache)
	changed()
}

/** Everything, as it is now. */
export function state(): State {
	if (current === null) current = read(storage?.cache)
	return current
}

function changed(): void {
	for (const fn of [...listeners]) {
		try {
			fn()
		} catch {
			// A screen that is gone must not stop the others.
		}
	}
}

/** Changes the state, saves it whole and tells the screens. */
export function update(change: (draft: State) => State | void): void {
	const before = state()
	const copy: State = JSON.parse(JSON.stringify(before))
	const next = change(copy) ?? copy
	if (!next.options.keepHistory) next.sent = []
	next.sent = next.sent.slice(0, SENT_LIMIT)
	current = next
	try {
		storage?.set(next, true)
	} catch {
		// Nothing can be saved before the storage is there.
	}
	changed()
}

/** Changes the message being made. */
export function editDraft(change: (draft: Draft) => Draft | void): void {
	update(s => {
		s.draft = change(s.draft) ?? s.draft
	})
}

/** Calls `fn` whenever something changes. Returns what stops it. */
export function subscribe(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}

/** Forgets what is held in memory. Used when the plugin stops. */
export function forget(): void {
	current = null
	listeners.clear()
}

/** A saved webhook by id. */
export function webhookById(id: string): Webhook | undefined {
	return state().webhooks.find(w => w.id === id)
}

/** A sent message by its entry id. */
export function sentById(id: string): Sent | undefined {
	return state().sent.find(s => s.id === id)
}
