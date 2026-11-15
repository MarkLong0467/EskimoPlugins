/**
 * Talking to Discord.
 *
 * A webhook's own address holds its key, so sending, editing and deleting with it needs no login: those go straight to
 * Discord's API. Finding the webhooks of a server and making new ones needs you to be logged in and allowed to manage
 * webhooks; those go through Discord's own connection, which adds your login by itself, so the plugin never sees it.
 */

import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { API, RATE_LIMIT_RETRIES, TIMEOUT_MS } from './constants'
import type { ApiMessage, ApiWebhook, Webhook } from './types'

/** A webhook's address, split into its id and key. Nothing if the text is not one. */
export function parseWebhookUrl(
	text: string,
): { id: string; token: string } | null {
	const match = text
		.trim()
		.match(
			/^https:\/\/(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com\/api(?:\/v\d+)?\/webhooks\/(\d{15,22})\/([\w-]{20,})\/?(?:\?.*)?$/i,
		)
	return match ? { id: match[1] as string, token: match[2] as string } : null
}

/** A webhook's address. */
export function webhookUrl(webhook: Pick<Webhook, 'id' | 'token'>): string {
	return `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`
}

/** A message's link, which opens it in Discord. */
export function messageLink(
	guildId: string | null,
	channelId: string,
	messageId: string,
): string {
	return `https://discord.com/channels/${guildId ?? '@me'}/${channelId}/${messageId}`
}

/** A message link split into its parts. */
export function parseMessageLink(
	text: string,
): { guildId: string | null; channelId: string; messageId: string } | null {
	const match = text
		.trim()
		.match(/discord(?:app)?\.com\/channels\/(@me|\d+)\/(\d+)\/(\d+)/)
	if (!match) return null
	return {
		guildId: match[1] === '@me' ? null : (match[1] as string),
		channelId: match[2] as string,
		messageId: match[3] as string,
	}
}

/** A webhook's avatar picture, or Discord's default one. */
export function avatarUrl(webhook: Pick<Webhook, 'id' | 'avatar'>): string {
	return webhook.avatar
		? `https://cdn.discordapp.com/avatars/${webhook.id}/${webhook.avatar}.png?size=128`
		: 'https://cdn.discordapp.com/embed/avatars/0.png'
}

/** An error from Discord, with what it said. */
export class ApiError extends Error {
	status: number
	code: number | undefined
	constructor(status: number, message: string, code?: number) {
		super(message)
		this.status = status
		this.code = code
	}
}

/** A short text for an error, for the screen. */
export function describeError(error: unknown): string {
	if (error instanceof ApiError) {
		if (error.status === 404 || error.code === 10015)
			return 'Discord says that webhook does not exist any more'
		if (error.status === 401 || error.code === 50027)
			return 'The webhook key is wrong'
		if (error.status === 403) return `Not allowed: ${error.message}`
		return `${error.message} (HTTP ${error.status})`
	}
	const e = error as
		| { status?: number; body?: { message?: string }; message?: string }
		| undefined
	if (e?.status)
		return `${e.body?.message || e.message || 'Error'} (HTTP ${e.status})`
	return e?.message || String(error)
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Rejects if the promise takes longer than `TIMEOUT_MS`. */
function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error('Discord did not answer in time')),
			TIMEOUT_MS,
		)
		Promise.resolve(promise).then(
			value => {
				clearTimeout(timer)
				resolve(value)
			},
			error => {
				clearTimeout(timer)
				reject(error)
			},
		)
	})
}

/** The text of Discord's errors, with the first problem it found in the message. */
function errorText(body: Record<string, unknown> | null): string {
	if (!body) return 'Discord refused it'
	let detail = ''
	const walk = (value: unknown, path: string) => {
		if (detail || !value || typeof value !== 'object') return
		const errors = (value as { _errors?: { message?: string }[] })._errors
		if (Array.isArray(errors) && errors[0]?.message) {
			detail = `${path}: ${errors[0].message}`
			return
		}
		for (const [key, inner] of Object.entries(value))
			walk(inner, path ? `${path}.${key}` : key)
	}
	walk(body.errors, '')
	const message =
		typeof body.message === 'string' ? body.message : 'Discord refused it'
	return detail ? `${message} (${detail})` : message
}

/**
 * Calls a webhook's own part of Discord's API. A request that is rate limited waits as long as Discord asks, then tries
 * again a few times.
 */
async function call<T>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		const response = await withTimeout(
			fetch(`${API}${path}`, {
				method,
				headers:
					body === undefined ? {} : { 'Content-Type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		)
		if (response.status === 204) return undefined as T
		let json: Record<string, unknown> | null = null
		try {
			json = (await response.json()) as Record<string, unknown>
		} catch {
			json = null
		}
		if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
			const seconds = Number(json?.retry_after) || 1
			await wait(Math.min(30, seconds) * 1000 + 50)
			continue
		}
		if (!response.ok)
			throw new ApiError(
				response.status,
				errorText(json),
				Number(json?.code) || undefined,
			)
		return json as T
	}
}

/** The query that sends into a thread, and lets a webhook that no bot owns send link buttons. */
function query(options: {
	threadId?: string
	wait?: boolean
	components?: boolean
}): string {
	const parts: string[] = []
	if (options.wait) parts.push('wait=true')
	if (options.threadId) parts.push(`thread_id=${options.threadId}`)
	if (options.components) parts.push('with_components=true')
	return parts.length ? `?${parts.join('&')}` : ''
}

/** What Discord says about a webhook, from its address alone. */
export function fetchWebhook(id: string, token: string): Promise<ApiWebhook> {
	return call<ApiWebhook>('GET', `/webhooks/${id}/${token}`)
}

/** Sends a message. Returns the message Discord made. */
export function execute(
	webhook: Webhook,
	payload: Record<string, unknown>,
	threadId?: string,
): Promise<ApiMessage> {
	return call<ApiMessage>(
		'POST',
		`/webhooks/${webhook.id}/${webhook.token}${query({ wait: true, threadId, components: Array.isArray(payload.components) && payload.components.length > 0 })}`,
		payload,
	)
}

/** A message the webhook sent. */
export function fetchMessage(
	webhook: Webhook,
	messageId: string,
	threadId?: string,
): Promise<ApiMessage> {
	return call<ApiMessage>(
		'GET',
		`/webhooks/${webhook.id}/${webhook.token}/messages/${messageId}${query({ threadId })}`,
	)
}

/** Changes a message the webhook sent. */
export function editMessage(
	webhook: Webhook,
	messageId: string,
	payload: Record<string, unknown>,
	threadId?: string,
): Promise<ApiMessage> {
	return call<ApiMessage>(
		'PATCH',
		`/webhooks/${webhook.id}/${webhook.token}/messages/${messageId}${query({ threadId, components: true })}`,
		payload,
	)
}

/** Deletes a message the webhook sent. */
export function deleteMessage(
	webhook: Webhook,
	messageId: string,
	threadId?: string,
): Promise<void> {
	return call<void>(
		'DELETE',
		`/webhooks/${webhook.id}/${webhook.token}/messages/${messageId}${query({ threadId })}`,
	)
}

/** Changes a webhook's name or avatar (a `data:` picture, or `null` to remove it). */
export function patchWebhook(
	webhook: Webhook,
	change: { name?: string; avatar?: string | null },
): Promise<ApiWebhook> {
	return call<ApiWebhook>(
		'PATCH',
		`/webhooks/${webhook.id}/${webhook.token}`,
		change,
	)
}

/** Deletes a webhook. Every message it sent stays. */
export function deleteWebhook(webhook: Webhook): Promise<void> {
	return call<void>('DELETE', `/webhooks/${webhook.id}/${webhook.token}`)
}

/** Reads a picture from a link as a `data:` address, which is how Discord takes a webhook's new avatar. */
export async function pictureAsData(url: string): Promise<string> {
	const response = await withTimeout(fetch(url))
	if (!response.ok)
		throw new Error(`Could not load the picture (HTTP ${response.status})`)
	const blob = await response.blob()
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => resolve(String(reader.result))
		reader.onerror = () =>
			reject(reader.error ?? new Error('Could not read the picture'))
		reader.readAsDataURL(blob)
	})
}

/** Discord's own connection, as far as this plugin uses it. */
interface DiscordHttp {
	get(request: { url: string }): PromiseLike<{ body?: unknown }>
	post(request: { url: string; body: object }): PromiseLike<{ body?: unknown }>
}

/** Discord's own connection to its API: the module with `HTTPResponseError`. */
function discordHttp(): DiscordHttp | undefined {
	try {
		return (
			(lookupModule(withProps('HTTPResponseError', 'get'))[0] as
				| DiscordHttp
				| undefined) ||
			(lookupModule(withProps('get', 'post', 'del', 'patch'))[0] as
				| DiscordHttp
				| undefined)
		)
	} catch {
		return undefined
	}
}

/** Makes Discord's connection throw what this file throws. */
async function logged<T>(
	run: (http: DiscordHttp) => PromiseLike<{ body?: unknown }>,
): Promise<T> {
	const http = discordHttp()
	if (!http) throw new Error('Could not find Discord’s connection')
	try {
		const response = await withTimeout(run(http))
		return response.body as T
	} catch (error) {
		const e = error as { status?: number; body?: Record<string, unknown> }
		if (e?.status)
			throw new ApiError(
				e.status,
				errorText(e.body ?? null),
				Number(e.body?.code) || undefined,
			)
		throw error
	}
}

/**
 * The webhooks of a server or a channel that you can use. Needs Manage Webhooks there. Webhooks that a bot made for
 * itself, and ones that follow another server's announcements, have no key you can send with, so they are left out.
 */
export async function listWebhooks(where: {
	guildId?: string
	channelId?: string
}): Promise<ApiWebhook[]> {
	const url = where.channelId
		? `/channels/${where.channelId}/webhooks`
		: `/guilds/${where.guildId}/webhooks`
	const list = await logged<ApiWebhook[]>(http => http.get({ url }))
	return (Array.isArray(list) ? list : []).filter(
		w => w && w.type === 1 && typeof w.token === 'string',
	)
}

/** Makes a webhook in a channel. Needs Manage Webhooks there. */
export function createWebhook(
	channelId: string,
	name: string,
	avatar?: string | null,
): Promise<ApiWebhook> {
	return logged<ApiWebhook>(http =>
		http.post({
			url: `/channels/${channelId}/webhooks`,
			body: avatar ? { name, avatar } : { name },
		}),
	)
}

/** Reads one message of a channel you can see, as Discord's API gives it. */
export async function fetchChannelMessage(
	channelId: string,
	messageId: string,
): Promise<ApiMessage | undefined> {
	const list = await logged<ApiMessage[]>(http =>
		http.get({
			url: `/channels/${channelId}/messages?limit=1&around=${messageId}`,
		}),
	)
	return (Array.isArray(list) ? list : []).find(m => m?.id === messageId)
}
