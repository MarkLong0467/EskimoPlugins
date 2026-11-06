import { getStorage, saveSettings, setting } from './config'
import { guildOf } from './discord'
import type { Reminder, Target } from './types'

/** Who wants to know when the list changes. */
const listeners = new Set<() => void>()

/**
 * The reminders as they are now. Saving is asynchronous, so the list is kept here too and changes show at once.
 * `null` until it is first read from the saved settings.
 */
let current: Reminder[] | null = null

/** Calls everyone who listens. */
function changed(): void {
	for (const fn of [...listeners]) {
		try {
			fn()
		} catch {
			// A screen that is gone must not stop the others.
		}
	}
}

/** Whether something read from storage looks like a reminder. */
function isReminder(value: unknown): value is Reminder {
	const r = value as Partial<Reminder> | null
	return (
		!!r &&
		typeof r.id === 'string' &&
		typeof r.channelId === 'string' &&
		typeof r.messageId === 'string' &&
		typeof r.at === 'number' &&
		Number.isFinite(r.at)
	)
}

/** Reads the reminders from the saved settings again. Used when the plugin starts. */
export function reload(): void {
	const saved = setting('reminders')
	current = Array.isArray(saved)
		? saved.filter(isReminder).map(r => ({
				...r,
				guildId: r.guildId ?? null,
				author: typeof r.author === 'string' ? r.author : '',
				preview: typeof r.preview === 'string' ? r.preview : '',
				createdAt: typeof r.createdAt === 'number' ? r.createdAt : r.at,
				snoozes: typeof r.snoozes === 'number' ? r.snoozes : 0,
			}))
		: []
	changed()
}

/** Replaces the list, keeps it in order of time, saves it and tells the listeners. */
function write(next: Reminder[]): void {
	current = [...next].sort((a, b) => a.at - b.at)
	saveSettings({ reminders: current })
	changed()
}

/** Every reminder, soonest first. */
export function all(): Reminder[] {
	if (current === null) reload()
	return [...(current ?? [])]
}

/** The reminders whose time has come, soonest first. */
export function due(now = Date.now()): Reminder[] {
	return all().filter(r => r.at <= now)
}

/** The reminders still to come, soonest first. */
export function upcoming(now = Date.now()): Reminder[] {
	return all().filter(r => r.at > now)
}

/** The reminder for a message, if there is one. */
export function forMessage(
	channelId: string,
	messageId: string,
): Reminder | undefined {
	return all().find(r => r.channelId === channelId && r.messageId === messageId)
}

/** A new id that is not used yet. */
function newId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Sets a reminder for a message. A message has one reminder, so setting another replaces the first.
 *
 * @returns The reminder, and whether it replaced an earlier one.
 */
export function add(
	target: Pick<Target, 'channelId' | 'messageId' | 'author' | 'preview'>,
	at: number,
): { reminder: Reminder; replaced: boolean } {
	const existing = forMessage(target.channelId, target.messageId)
	const reminder: Reminder = {
		id: existing?.id ?? newId(),
		channelId: target.channelId,
		messageId: target.messageId,
		guildId: guildOf(target.channelId),
		author: target.author,
		preview: target.preview,
		at,
		createdAt: Date.now(),
		snoozes: 0,
	}
	write([...all().filter(r => r.id !== reminder.id), reminder])
	return { reminder, replaced: !!existing }
}

/** Removes a reminder. */
export function remove(id: string): void {
	write(all().filter(r => r.id !== id))
}

/** Moves a reminder to a later time and counts the snooze. */
export function snooze(id: string, at: number): void {
	write(
		all().map(r => (r.id === id ? { ...r, at, snoozes: r.snoozes + 1 } : r)),
	)
}

/** Removes every reminder. */
export function clear(): void {
	write([])
}

/** Calls `fn` whenever the list changes. Returns what stops it. */
export function subscribe(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}

/** Forgets the list held here. Used when the plugin stops. */
export function forget(): void {
	current = null
	listeners.clear()
}

/** Whether the storage has been handed over yet. */
export function ready(): boolean {
	return getStorage() !== undefined
}
