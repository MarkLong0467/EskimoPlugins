import type { Draft, Embed, Options, Poll, State } from './types'

/** Discord's API. */
export const API = 'https://discord.com/api/v10'

/** Discord's limits for a message, from its API documentation. */
export const LIMITS = {
	content: 2000,
	username: 80,
	embeds: 10,
	title: 256,
	description: 4096,
	fields: 25,
	fieldName: 256,
	fieldValue: 1024,
	footer: 2048,
	author: 256,
	/** All the text of all the embeds of one message together. */
	embedTotal: 6000,
	buttonRows: 5,
	buttonsPerRow: 5,
	buttonLabel: 80,
	pollQuestion: 300,
	pollAnswers: 10,
	pollAnswer: 55,
	pollHours: 768,
	threadName: 100,
	/** More pictures shown with an embed's picture, as a gallery. */
	gallery: 3,
} as const

/** How many sent messages are remembered. */
export const SENT_LIMIT = 100

/** How often the scheduled messages are looked at. */
export const SCHEDULE_TICK_MS = 15_000

/** How long a request may take. */
export const TIMEOUT_MS = 20_000

/** How often a request that was rate limited is tried again. */
export const RATE_LIMIT_RETRIES = 3

/** The keys sheets are opened with. */
export const MENU_SHEET_KEY = 'WebhookBuilderMessage'
export const PICK_SHEET_KEY = 'WebhookBuilderPick'

/** The label of the row in the message menu. */
export const MENU_LABEL = 'Webhook Builder'

/** The key of the plugin's toasts. */
export const TOAST_KEY = 'webhook-builder'

/** Colours to pick from, with Discord's names. */
export const COLORS: { name: string; hex: string }[] = [
	{ name: 'Blurple', hex: '#5865f2' },
	{ name: 'Green', hex: '#57f287' },
	{ name: 'Yellow', hex: '#fee75c' },
	{ name: 'Fuchsia', hex: '#eb459e' },
	{ name: 'Red', hex: '#ed4245' },
	{ name: 'White', hex: '#ffffff' },
	{ name: 'Black', hex: '#23272a' },
	{ name: 'Orange', hex: '#e67e22' },
	{ name: 'Aqua', hex: '#1abc9c' },
	{ name: 'Purple', hex: '#9b59b6' },
]

/** A new, empty embed. */
export function emptyEmbed(key = newId()): Embed {
	return {
		key,
		title: '',
		url: '',
		description: '',
		color: '',
		authorName: '',
		authorUrl: '',
		authorIcon: '',
		footerText: '',
		footerIcon: '',
		image: '',
		gallery: [],
		thumbnail: '',
		timestampMode: 'none',
		timestamp: 0,
		fields: [],
	}
}

/** A new poll. */
export function emptyPoll(): Poll {
	return { question: '', answers: ['', ''], hours: 24, multiselect: false }
}

/** A new, empty message. */
export function emptyDraft(): Draft {
	return {
		content: '',
		username: '',
		avatarUrl: '',
		embeds: [],
		buttons: [],
		poll: null,
		threadId: '',
		threadName: '',
		silent: false,
		suppressEmbeds: false,
		tts: false,
		mentions: 'all',
	}
}

export const DEFAULT_OPTIONS: Options = {
	menu: true,
	confirmSend: true,
	sendLate: true,
	keepHistory: true,
}

/** What the plugin starts with. */
export function emptyState(): State {
	return {
		webhooks: [],
		saved: [],
		sent: [],
		scheduled: [],
		draft: emptyDraft(),
		target: { webhookIds: [], editing: '' },
		options: { ...DEFAULT_OPTIONS },
	}
}

/** A new id that is not used yet. */
export function newId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
