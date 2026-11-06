import { onFluxEventDispatched } from '@valenced/discord/flux'
import { getCurrentUserId, onImportedPath } from './modules'
import {
	forceRerenderMessage,
	getSettings,
	isHidden,
	isLocalEdit,
	markDeleted,
	recordEditTrail,
	unhideMessage,
} from './state'

let messageStore: any

export function patchLogging(): () => void {
	const unpatch: Array<() => void> = []

	const unsubStore = onImportedPath('stores/MessageStore.tsx', (ns: any) => {
		messageStore = ns?.default ?? ns
	})
	unpatch.push(unsubStore)

	// Keep deleted messages on chat: intercept MESSAGE_DELETE pre-dispatch and
	// drop it while the record is still in MessageStore. The row stays and the
	// renderer patches mark it ("message deleted" + red tint). Other people's
	// deletions are always kept; own ones only with logOwnEdits, so a self-delete
	// (mod action, "ghost ping", ...) still looks normal by default.
	unpatch.push(
		onFluxEventDispatched('MESSAGE_DELETE', (event: any) => {
			try {
				if (!getSettings().keepDeleted) return event
				const channelId: string = event?.channelId ?? event?.channel_id ?? ''
				const id: string = event?.id ?? ''
				if (!channelId || !id) return event
				const msg = messageStore?.getMessage?.(channelId, id)
				if (msg == null) return event
				if (
					!getSettings().logOwnEdits &&
					msg?.author?.id === getCurrentUserId()
				) {
					return event
				}
				markDeleted(channelId, id)
				forceRerenderMessage(channelId, id)
				return undefined
			} catch {
				return event
			}
		}),
	)

	// Pre-dispatch hook, not a store subscriber, so getMessage() still returns
	// the old content -- that's the "before" text for the trail. Returning the
	// payload keeps the store applying the edit normally.
	const onUpdate = (payload: any) => {
		const incoming = payload?.message
		if (!incoming || typeof incoming?.id !== 'string') return
		const channelId = incoming?.channel_id ?? incoming?.channelId ?? ''
		if (!channelId) return
		const prev = messageStore?.getMessage?.(channelId, incoming.id)
		const after = typeof incoming?.content === 'string' ? incoming.content : ''
		const before = typeof prev?.content === 'string' ? prev.content : ''

		// An edit implies the message wasn't deleted; reveal it so the hidden state
		// doesn't linger.
		try {
			if (isHidden(channelId, incoming.id)) {
				unhideMessage(channelId, incoming.id)
			}
		} catch {}

		// Stack the previous content into the muted edit trail above the current
		// version. Local ghost edits are excluded (own on-device tweak, not a
		// remote edit); own edits trail only with logOwnEdits, like deletions.
		try {
			if (
				getSettings().showEditTrail &&
				!isLocalEdit(channelId, incoming.id) &&
				(getSettings().logOwnEdits ||
					prev?.author?.id !== getCurrentUserId()) &&
				before !== after &&
				before !== ''
			) {
				recordEditTrail(channelId, incoming.id, before, after)
			}
		} catch {}
	}

	unpatch.push(
		onFluxEventDispatched('MESSAGE_UPDATE', (payload: any) => {
			try {
				onUpdate(payload)
			} catch {}
			return payload
		}),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}
