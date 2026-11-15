/** What the screens and the menu do: keep webhooks, send, edit and delete messages, save and schedule them. */

import {
	createWebhook,
	deleteMessage,
	deleteWebhook,
	describeError,
	editMessage,
	execute,
	fetchMessage,
	fetchWebhook,
	parseWebhookUrl,
	patchWebhook,
	pictureAsData,
} from './api'
import { emptyDraft, newId } from './constants'
import { diag, stats } from './diag'
import { draftFrom, previewOf, toPayload } from './payload'
import { state, update, webhookById } from './state'
import type {
	ApiWebhook,
	Draft,
	Repeat,
	SendResult,
	Sent,
	Webhook,
} from './types'

/** A saved webhook from what Discord said about it. */
function fromApi(
	api: ApiWebhook,
	token: string,
	label?: string,
	before?: Webhook,
): Webhook {
	return {
		id: api.id,
		token,
		label: label || before?.label || api.name || 'Webhook',
		name: api.name ?? before?.name ?? '',
		avatar: api.avatar ?? null,
		channelId: api.channel_id ?? before?.channelId ?? null,
		guildId: api.guild_id ?? before?.guildId ?? null,
		addedAt: before?.addedAt ?? Date.now(),
	}
}

/** Puts a webhook in the list, or brings the one that is there up to date. */
function keep(webhook: Webhook): void {
	update(s => {
		const at = s.webhooks.findIndex(w => w.id === webhook.id)
		if (at >= 0) s.webhooks[at] = webhook
		else s.webhooks.push(webhook)
		if (s.target.webhookIds.length === 0) s.target.webhookIds = [webhook.id]
	})
}

/**
 * Saves a webhook from its address, after asking Discord whether it works.
 *
 * @throws When the address is not a webhook's or Discord does not know it.
 */
export async function addWebhook(
	url: string,
	label?: string,
): Promise<Webhook> {
	const parts = parseWebhookUrl(url)
	if (!parts)
		throw new Error(
			'That is not a webhook address. It looks like https://discord.com/api/webhooks/123/abc',
		)
	const api = await fetchWebhook(parts.id, parts.token)
	const webhook = fromApi(
		api,
		parts.token,
		label?.trim(),
		webhookById(parts.id),
	)
	keep(webhook)
	diag.log('webhook', 'added from an address')
	return webhook
}

/** Saves webhooks Discord listed for a server or a channel. Returns how many were new. */
export function addListed(list: ApiWebhook[]): number {
	let added = 0
	for (const api of list) {
		if (!api.token) continue
		if (!webhookById(api.id)) added++
		keep(fromApi(api, api.token, undefined, webhookById(api.id)))
	}
	diag.log('webhook', `${list.length} listed, ${added} new`)
	return added
}

/** Makes a new webhook in a channel and saves it. */
export async function makeWebhook(
	channelId: string,
	name: string,
	avatarLink?: string,
): Promise<Webhook> {
	const avatar = avatarLink?.trim()
		? await pictureAsData(avatarLink.trim())
		: null
	const api = await createWebhook(channelId, name.trim() || 'Webhook', avatar)
	if (!api.token)
		throw new Error('Discord made the webhook but did not give its key')
	const webhook = fromApi(api, api.token)
	keep(webhook)
	diag.log('webhook', 'made in a channel')
	return webhook
}

/** Asks Discord about a saved webhook again, for its name, avatar and channel. */
export async function refreshWebhook(id: string): Promise<Webhook> {
	const before = webhookById(id)
	if (!before) throw new Error('That webhook is not saved')
	const api = await fetchWebhook(before.id, before.token)
	const webhook = fromApi(api, before.token, before.label, before)
	keep(webhook)
	return webhook
}

/** Renames the saved entry only (Discord keeps the webhook's own name). */
export function relabel(id: string, label: string): void {
	update(s => {
		const w = s.webhooks.find(x => x.id === id)
		if (w) w.label = label.trim() || w.name || 'Webhook'
	})
}

/** Changes the webhook's own name and avatar on Discord. An empty avatar link keeps the avatar; `remove` takes it away. */
export async function changeWebhook(
	id: string,
	change: { name?: string; avatarLink?: string; removeAvatar?: boolean },
): Promise<Webhook> {
	const before = webhookById(id)
	if (!before) throw new Error('That webhook is not saved')
	const body: { name?: string; avatar?: string | null } = {}
	if (change.name?.trim()) body.name = change.name.trim()
	if (change.removeAvatar) body.avatar = null
	else if (change.avatarLink?.trim())
		body.avatar = await pictureAsData(change.avatarLink.trim())
	const api = await patchWebhook(before, body)
	const webhook = fromApi(
		api,
		before.token,
		before.label === before.name ? api.name || before.label : before.label,
		before,
	)
	keep(webhook)
	diag.log('webhook', 'changed on Discord')
	return webhook
}

/** Forgets a saved webhook. It still works on Discord. */
export function forgetWebhook(id: string): void {
	update(s => {
		s.webhooks = s.webhooks.filter(w => w.id !== id)
		s.target.webhookIds = s.target.webhookIds.filter(x => x !== id)
		s.scheduled = s.scheduled
			.map(x => ({ ...x, webhookIds: x.webhookIds.filter(w => w !== id) }))
			.filter(x => x.webhookIds.length > 0)
	})
}

/** Deletes a webhook on Discord, then forgets it. */
export async function destroyWebhook(id: string): Promise<void> {
	const webhook = webhookById(id)
	if (!webhook) return
	await deleteWebhook(webhook)
	forgetWebhook(id)
	diag.log('webhook', 'deleted on Discord')
}

/** Remembers a message that was sent, newest first. */
function remember(
	webhook: Webhook,
	message: { id: string; channel_id?: string },
	draft: Draft,
	sentText: string,
): Sent {
	const entry: Sent = {
		id: newId(),
		webhookId: webhook.id,
		messageId: message.id,
		channelId: message.channel_id ?? webhook.channelId,
		guildId: webhook.guildId,
		threadId:
			draft.threadId.trim() ||
			(draft.threadName.trim() ? (message.channel_id ?? null) : null),
		// The words in braces as they were filled in.
		preview: previewOf({ ...draft, content: sentText }),
		at: Date.now(),
	}
	update(s => {
		s.sent.unshift(entry)
	})
	return entry
}

/**
 * Sends a message with each of the webhooks, one after the other.
 *
 * @returns What happened with each webhook.
 */
export async function send(
	draft: Draft,
	webhookIds: string[],
): Promise<SendResult[]> {
	const results: SendResult[] = []
	for (const id of webhookIds) {
		const webhook = webhookById(id)
		if (!webhook) continue
		try {
			const payload = toPayload(draft, {
				webhook: webhook.label || webhook.name,
			})
			const message = await execute(
				webhook,
				payload,
				draft.threadId.trim() || undefined,
			)
			remember(webhook, message, draft, String(payload.content ?? ''))
			results.push({ webhook, ok: true, message })
			stats.sent++
		} catch (error) {
			results.push({ webhook, ok: false, error: describeError(error) })
			stats.failed++
			diag.log('send', describeError(error), 'warn')
		}
	}
	return results
}

/** The webhook and message of a sent entry. */
function sentParts(sentId: string): { sent: Sent; webhook: Webhook } {
	const sent = state().sent.find(s => s.id === sentId)
	if (!sent) throw new Error('That message is not in the list any more')
	const webhook = webhookById(sent.webhookId)
	if (!webhook)
		throw new Error('The webhook that sent it is not saved any more')
	return { sent, webhook }
}

/** Loads a message that was sent into the editor, to change it. */
export async function loadSent(sentId: string): Promise<void> {
	const { sent, webhook } = sentParts(sentId)
	const message = await fetchMessage(
		webhook,
		sent.messageId,
		sent.threadId ?? undefined,
	)
	const draft = draftFrom(message)
	// The editor keeps the name and avatar so the message looks the same; a change cannot set them.
	draft.threadId = sent.threadId ?? ''
	update(s => {
		s.draft = draft
		s.target = { webhookIds: [webhook.id], editing: sentId }
	})
}

/** Saves the editor's message over the message that was sent. */
export async function saveEdit(sentId: string, draft: Draft): Promise<void> {
	const { sent, webhook } = sentParts(sentId)
	await editMessage(
		webhook,
		sent.messageId,
		toPayload(draft, { mode: 'edit', webhook: webhook.label }),
		sent.threadId ?? undefined,
	)
	update(s => {
		const entry = s.sent.find(x => x.id === sentId)
		if (entry) entry.preview = previewOf(draft)
	})
	stats.edited++
}

/** Deletes a message that was sent, and its entry. */
export async function deleteSent(sentId: string): Promise<void> {
	const { sent, webhook } = sentParts(sentId)
	try {
		await deleteMessage(webhook, sent.messageId, sent.threadId ?? undefined)
	} catch (error) {
		// A message someone already deleted is as good as deleted.
		if (!/does not exist|Unknown Message/i.test(describeError(error)))
			throw error
	}
	forgetSent(sentId)
}

/** Takes a message off the list of sent ones. It stays in Discord. */
export function forgetSent(sentId: string): void {
	update(s => {
		s.sent = s.sent.filter(x => x.id !== sentId)
		if (s.target.editing === sentId) s.target.editing = ''
	})
}

/** Stops editing a sent message: the editor makes a new one again. */
export function stopEditing(): void {
	update(s => {
		s.target.editing = ''
	})
}

/** Starts a new, empty message. */
export function clearDraft(): void {
	update(s => {
		s.draft = emptyDraft()
		s.target.editing = ''
	})
}

/** Puts a message into the editor. */
export function loadDraft(draft: Draft): void {
	update(s => {
		s.draft = JSON.parse(JSON.stringify(draft))
		s.target.editing = ''
	})
}

/** Saves a message under a name. A message with the same name is replaced. */
export function saveAs(name: string, draft: Draft): void {
	const clean = name.trim() || previewOf(draft)
	update(s => {
		const same = s.saved.find(x => x.name === clean)
		const entry = {
			id: same?.id ?? newId(),
			name: clean,
			draft: JSON.parse(JSON.stringify(draft)),
			savedAt: Date.now(),
		}
		s.saved = [entry, ...s.saved.filter(x => x.id !== entry.id)]
	})
}

/** Removes a saved message. */
export function removeSaved(id: string): void {
	update(s => {
		s.saved = s.saved.filter(x => x.id !== id)
	})
}

/** Renames a saved message. */
export function renameSaved(id: string, name: string): void {
	update(s => {
		const x = s.saved.find(y => y.id === id)
		if (x && name.trim()) x.name = name.trim()
	})
}

/** Adds messages that were pasted to the saved ones. */
export function addSaved(found: { name: string; draft: Draft }[]): void {
	update(s => {
		s.saved = [
			...found.map(f => ({
				id: newId(),
				name: f.name,
				draft: f.draft,
				savedAt: Date.now(),
			})),
			...s.saved,
		]
	})
}

/** Sets a message to be sent later. */
export function schedule(
	at: number,
	repeat: Repeat,
	webhookIds: string[],
	draft: Draft,
): void {
	update(s => {
		s.scheduled.push({
			id: newId(),
			at,
			repeat,
			webhookIds: [...webhookIds],
			draft: JSON.parse(JSON.stringify(draft)),
			lastError: '',
		})
		s.scheduled.sort((a, b) => a.at - b.at)
	})
	diag.log('schedule', `set, repeat ${repeat}`)
}

/** Cancels a scheduled message. */
export function unschedule(id: string): void {
	update(s => {
		s.scheduled = s.scheduled.filter(x => x.id !== id)
	})
}

const STEP: Record<Repeat, number> = {
	none: 0,
	hourly: 3_600_000,
	daily: 86_400_000,
	weekly: 604_800_000,
}

/** The next time a repeating message is due after `now`. */
export function nextTime(at: number, repeat: Repeat, now: number): number {
	const step = STEP[repeat]
	if (!step) return at
	let next = at
	while (next <= now) next += step
	return next
}

/** Whether a scheduled send is running, so two ticks do not send the same message. */
let running = false

/**
 * Sends the scheduled messages that are due. One that came due long ago (while Discord was closed) is sent only if the
 * options say so; otherwise it is skipped (or moved to its next time if it repeats).
 *
 * @returns How many were sent.
 */
export async function runDue(now = Date.now()): Promise<number> {
	if (running) return 0
	running = true
	let count = 0
	try {
		const due = state().scheduled.filter(x => x.at <= now)
		for (const item of due) {
			const late = now - item.at > 5 * 60_000
			let error = ''
			if (!late || state().options.sendLate) {
				const results = await send(item.draft, item.webhookIds)
				const failed = results.filter(r => !r.ok)
				if (results.length > failed.length) count++
				error = failed.map(r => `${r.webhook.label}: ${r.error}`).join('; ')
			} else error = 'Skipped: it came due while Discord was closed'
			if (error) {
				stats.lastScheduleError = error
				diag.log('schedule', error, 'warn')
			}
			update(s => {
				const x = s.scheduled.find(y => y.id === item.id)
				if (!x) return
				if (x.repeat === 'none')
					s.scheduled = s.scheduled.filter(y => y.id !== item.id)
				else {
					x.at = nextTime(x.at, x.repeat, now)
					x.lastError = error
				}
				s.scheduled.sort((a, b) => a.at - b.at)
			})
		}
	} finally {
		running = false
	}
	return count
}
