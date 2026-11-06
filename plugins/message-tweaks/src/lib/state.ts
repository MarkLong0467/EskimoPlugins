import { DEFAULTS } from '../defaults'
import type { JsonStorage } from '@valenced/json-storage'
import type { MessageTrail, MessageTweaksStorage } from '../types'

type RevengeJsonStorageApi<S extends object> = JsonStorage<S>

let storage: RevengeJsonStorageApi<MessageTweaksStorage> | undefined

export function setStorage(
	handle: RevengeJsonStorageApi<MessageTweaksStorage>,
) {
	storage = handle
	try {
		hydratePersisted(getSettings().persisted)
	} catch {}
}

export function getStorage() {
	return storage
}

// storage.cache is plain data; storage.use() is a React hook
// and throws "Invalid hook call" inside patched renderers.
export function getSettings(): MessageTweaksStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

function hydratePersisted(
	p: { hidden?: Record<string, Record<string, string>> } | undefined,
) {
	if (!p) return
	try {
		for (const [ch, byId] of Object.entries(p.hidden ?? {})) {
			for (const [id, author] of Object.entries(byId)) {
				hiddenMessages.set(`${ch}:${id}`, author)
			}
		}
	} catch {}
}

// Write the runtime state (hidden messages) into storage so it survives app
// restarts. Kept as a plain object nested under settings.
function persistNow() {
	try {
		const next: { hidden: Record<string, Record<string, string>> } = {
			hidden: {},
		}
		for (const [k, author] of hiddenMessages) {
			const sep = k.indexOf(':')
			if (sep < 0) continue
			const ch = k.slice(0, sep)
			const id = k.slice(sep + 1)
			;(next.hidden[ch] ??= {})[id] = author
		}
		storage?.set({ ...getSettings(), persisted: next })
	} catch {}
}

// --- Message overrides (hide) ----------------------------------------------

// Key is channelId:messageId -> authorName; the author name keeps the
// persisted format backwards-compatible (was shown in a "message hidden"
// placeholder) and no longer affects rendering.
const hiddenMessages = new Map<string, string>()

function key(channelId: string, messageId: string): string {
	return `${channelId}:${messageId}`
}

export function isHidden(channelId: string, messageId: string): boolean {
	return hiddenMessages.has(key(channelId, messageId))
}

export function hideMessage(
	channelId: string,
	messageId: string,
	authorName: string,
) {
	if (!getSettings().hideLog) return
	hiddenMessages.set(key(channelId, messageId), authorName)
	persistNow()
}

export function unhideMessage(channelId: string, messageId: string) {
	if (hiddenMessages.delete(key(channelId, messageId))) {
		persistNow()
	}
}

export function clearChannelStorage(channelId: string) {
	const prefix = `${channelId}:`
	for (const k of hiddenMessages.keys())
		if (k.startsWith(prefix)) hiddenMessages.delete(k)
	for (const k of editTrails.keys())
		if (k.startsWith(prefix)) editTrails.delete(k)
	for (const k of deletedMessages.keys())
		if (k.startsWith(prefix)) deletedMessages.delete(k)
	persistNow()
}

// --- Edit history trails (session-only) -------------------------------------

const editTrails = new Map<string, MessageTrail>()

export function getEditTrail(
	channelId: string,
	messageId: string,
): MessageTrail | undefined {
	return editTrails.get(key(channelId, messageId))
}

export function recordEditTrail(
	channelId: string,
	messageId: string,
	before: string,
	after: string,
) {
	if (before === after || before === '') return
	const k = key(channelId, messageId)
	const entry = editTrails.get(k)
	if (entry != null) {
		if (entry.current !== before) {
			entry.versions.push(entry.current)
		} else if (entry.versions[entry.versions.length - 1] !== before) {
			entry.versions.push(before)
		}
		entry.current = after
	} else {
		editTrails.set(k, { versions: [before], current: after })
	}
}

// --- Edited display handled via renderer patches (edit trail + hidden) -----

// Local edits are on-device ghosts (no server round trip) but still dispatch
// MESSAGE_UPDATE, so they must not stack into the sender's edit trail
// (trail = evidence of remote edits). Session-set, keyed per message.
const localEditKeys = new Set<string>()

export function markLocalEdit(channelId: string, messageId: string) {
	localEditKeys.add(key(channelId, messageId))
}

export function isLocalEdit(channelId: string, messageId: string): boolean {
	return localEditKeys.has(key(channelId, messageId))
}

// --- Deleted messages kept on chat (session-only) ---------------------------

const deletedMessages = new Set<string>()

export function isDeleted(channelId: string, messageId: string): boolean {
	return deletedMessages.has(key(channelId, messageId))
}

export function markDeleted(channelId: string, messageId: string) {
	deletedMessages.add(key(channelId, messageId))
}

// --- Single-message re-render (no full chat reload) -------------------------

// FlashList memoizes rows by the message object reference. To re-render one
// row only, replace its record with a new reference (same content) in the
// ChannelMessages cache and emit a change; other rows keep their references.

let channelMessagesCache: any
let messageStoreRef: any

export function setChannelMessagesCache(cache: any) {
	channelMessagesCache = cache
}

export function setMessageStore(store: any) {
	messageStoreRef = store
}

export function getMessageStore(): any {
	return messageStoreRef
}

export function forceRerenderMessage(
	channelId: string,
	messageId: string,
	forceContentChange = false,
): boolean {
	try {
		if (!channelMessagesCache) {
			return false
		}
		const collection = channelMessagesCache.getOrCreate(channelId)
		if (!collection?.has(messageId)) {
			return false
		}
		// ChannelMessages update()/mutate() are immutable: they return a new
		// collection and don't write back to the map; commit() just stashes the
		// object it's given. The return value MUST be committed or the store
		// keeps serving the old record.
		const updated = collection.update(messageId, (msg: any) => {
			try {
				// Clone via Object.create/defineProperties: same prototype and fields, new
				// identity so memoized rows re-render. msg.merge({}) and new
				// msg.constructor(msg) both produce records with missing array
				// fields that crash areHookInputsEqual; defineProperties copies
				// without invoking getters.
				const descriptors = Object.getOwnPropertyDescriptors(msg)
				const clone = Object.create(Object.getPrototypeOf(msg))
				Object.defineProperties(clone, descriptors)
				// determineChangeType deep-equals the new record vs the previous one
				// (determineChangeType(tmp, message)) and yields NOOP for a
				// byte-identical clone, so the cell keeps its old look until the
				// channel reopens. For deleted rows (and in-place repaints when
				// forceContentChange is set) append an invisible zero-width space
				// so the record differs => changeset pushes the row as an UPDATE.
				// The row renders from this same record, so the char stays invisible.
				if (clone?.id !== messageId) return msg
				// `forceContentChange` appends the same invisible char as the deleted path.
				if (
					(forceContentChange || isDeleted(channelId, messageId)) &&
					typeof clone.content === 'string' &&
					!clone.content.endsWith('\u200b')
				) {
					try {
						clone.content = `${clone.content}\u200b`
					} catch {}
				}
				return clone
			} catch {
				return msg
			}
		})
		channelMessagesCache.commit(updated)
		// Postpone emitChange() until the current React commit batch finishes;
		// calling it synchronously inside a press handler re-enters React
		// mid-render ("Rendered fewer hooks").
		try {
			queueMicrotask(() => {
				try {
					messageStoreRef?.emitChange?.()
				} catch {}
			})
		} catch {
			try {
				messageStoreRef?.emitChange?.()
			} catch {}
		}
		return true
	} catch {
		return false
	}
}

// Same remove()/commit()/emit path Discord's own MESSAGE_DELETE handler
// uses, but local only, so the row vanishes like a real delete while the
// server still holds the message. It resurfaces on the next fetch/pagination
// and the renderer patch shows it as the "message hidden" placeholder.
export function removeMessage(channelId: string, messageId: string): boolean {
	try {
		if (!channelMessagesCache) return false
		const collection = channelMessagesCache.getOrCreate(channelId)
		if (!collection?.has(messageId)) return false
		const removed = collection.remove(messageId)
		channelMessagesCache.commit(removed)
		try {
			queueMicrotask(() => {
				try {
					messageStoreRef?.emitChange?.()
				} catch {}
			})
		} catch {
			try {
				messageStoreRef?.emitChange?.()
			} catch {}
		}
		return true
	} catch {
		return false
	}
}

// --- Pending local edit (native composer session) --------------------------

let pendingLocalEdit: { channelId: string; messageId: string } | null = null

export function setPendingLocalEdit(channelId: string, messageId: string) {
	pendingLocalEdit = { channelId, messageId }
}

export function consumePendingLocalEdit(
	channelId: string,
	messageId: string,
): boolean {
	if (pendingLocalEdit == null) return false
	const matches =
		pendingLocalEdit.channelId === channelId &&
		pendingLocalEdit.messageId === messageId
	if (matches) pendingLocalEdit = null
	return matches
}

export function clearPendingLocalEditForChannel(channelId: string) {
	if (pendingLocalEdit != null && pendingLocalEdit.channelId === channelId) {
		pendingLocalEdit = null
	}
}
