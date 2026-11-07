/**
 * Hooks into Discord's event stream, like Equicord's `FluxDispatcher.addInterceptor`.
 *
 * Valenced's `onFluxEventDispatched(type, patch)` runs before Discord's stores get an event. The patch may change the event
 * and must return it, or return nothing to stop it. Three events are used, the same as in Equicord:
 *
 * - `MESSAGE_CREATE` and `MESSAGE_UPDATE`: the pings are taken out of a message from someone silenced (`filter.ts`).
 * - `NOTIFICATION_CREATE`: a notification for a message from someone silenced is stopped. Discord's phone app may never send
 *   this event, which the report shows by counting how many were seen.
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { diag } from './diag'
import {
	isBag,
	isFromSilenced,
	notificationMessage,
	silenceMessage,
} from './filter'
import { myId } from './people'
import { RECENT_MAX, state } from './state'
import { setting } from './store'
import type { Bag, Outcome, Rules } from './filter'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** Who and what is silenced right now. */
export function currentRules(): Rules {
	return {
		users: new Set(setting('users')),
		all: setting('silenceAll'),
		everyone: setting('silenceEveryone'),
		roles: setting('silenceRoles'),
	}
}

/** What a message looks like, as yes and no for each part, so a changed Discord shows up in the report. No ids, no text. */
function describe(message: Bag): string {
	const list = (value: unknown) => (Array.isArray(value) ? 'list' : 'none')
	return [
		`author ${isBag(message.author) && message.author.id != null ? 'yes' : 'no'}`,
		`mentions ${list(message.mentions)}`,
		`mention_roles ${list(message.mention_roles)}`,
		`mention_everyone ${typeof message.mention_everyone === 'boolean' ? 'flag' : 'none'}`,
		`camelCase fields ${'mentionEveryone' in message || 'mentionRoles' in message ? 'yes' : 'no'}`,
	].join(', ')
}

/** Remembers who pinged you, so the settings can offer to silence them. */
function remember(author: Bag, outcome: Outcome): void {
	const id = String(author.id ?? '')
	if (!id || id === myId()) return
	const entry = state.recent.find(p => p.id === id)
	const silenced = outcome.silenced && outcome.changed
	if (entry) {
		entry.pings++
		if (silenced) entry.silenced++
		entry.at = Date.now()
		entry.name = String(author.global_name || author.username || entry.name)
		state.recent = [entry, ...state.recent.filter(p => p !== entry)]
		return
	}
	state.recent = [
		{
			id,
			name: String(author.global_name || author.username || id),
			username: String(author.username || ''),
			avatar: typeof author.avatar === 'string' ? author.avatar : null,
			pings: 1,
			silenced: silenced ? 1 : 0,
			at: Date.now(),
		},
		...state.recent,
	].slice(0, RECENT_MAX)
}

/** The patch for a message being made or edited. */
function onMessage(kind: 'created' | 'updated') {
	return (payload: unknown): unknown => {
		try {
			const message = isBag(payload) ? payload.message : undefined
			if (!isBag(message)) return payload
			state[kind]++
			state.shape = describe(message)
			const rules = currentRules()
			const outcome = silenceMessage(message, rules, myId())
			if (outcome.silenced) state.fromSilenced++
			if (outcome.direct && outcome.silenced) state.clearedDirect++
			if (outcome.everyone && (outcome.silenced || rules.everyone))
				state.clearedEveryone++
			if (outcome.roles && (outcome.silenced || rules.roles))
				state.clearedRoles++
			if (outcome.changed) {
				state.last = `took the pings out of a message (${kind})`
			}
			if (
				kind === 'created' &&
				isBag(message.author) &&
				(outcome.direct || outcome.everyone)
			)
				remember(message.author, outcome)
		} catch (error) {
			state.failures++
			diag.fail(`message ${kind}`, error)
		}
		return payload
	}
}

/** The patch for a notification about to be shown. */
function onNotification(payload: unknown): unknown {
	try {
		state.notifications++
		const message = notificationMessage(payload)
		if (isFromSilenced(message, new Set(setting('users')))) {
			state.notificationsBlocked++
			state.last = 'stopped a notification'
			return undefined
		}
	} catch (error) {
		state.failures++
		diag.fail('notification', error)
	}
	return payload
}

/**
 * Registers the three patches.
 *
 * @param cleanup Where to register what takes them off again.
 */
export function installFlux(cleanup: Cleanup): void {
	let failed = false
	const add = (type: string, patch: (payload: unknown) => unknown) =>
		cleanup(
			diag.apply(`${type} patch`, () => {
				try {
					return onFluxEventDispatched(type, patch as never)
				} catch (error) {
					failed = true
					throw error
				}
			}),
		)
	add('MESSAGE_CREATE', onMessage('created'))
	add('MESSAGE_UPDATE', onMessage('updated'))
	add('NOTIFICATION_CREATE', onNotification)
	state.hook = failed ? 'failed' : 'registered'
}
