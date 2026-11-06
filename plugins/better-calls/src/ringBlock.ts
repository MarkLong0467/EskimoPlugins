import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { shouldBeSilent } from './config'
import { diag } from './diag'
import { state } from './state'

/**
 * Stops Discord from ringing for silent calls.
 *
 * The original replaced `CallActionCreators.ring`. Every way Discord has of ringing ends in the same request, though:
 * `POST /channels/<id>/call/ring`. `ring` sends it, and so does the call store when a ring that had to wait is sent. This
 * stops that request at Discord's HTTP layer, so it does not depend on finding the call module, which Discord only loads when
 * a call is first made.
 *
 * The HTTP object is the one the HypeSquad Switcher finds in the same way, by `HTTPResponseError` and `get`.
 */

/** The request Discord sends to ring. */
const RING_URL = /\/channels\/([^/?#]+)\/call\/ring(?:[/?#]|$)/

/** What this plugin reads of the HTTP object and of a request. */
interface Http {
	get?: unknown
	post(request: { url?: unknown; body?: unknown }, ...rest: unknown[]): unknown
}

/** The HTTP object, from what a finder gave: the object itself or its default export. */
function httpOf(exports: unknown): Http | undefined {
	const e = exports as
		| (Partial<Http> & { default?: Partial<Http> })
		| null
		| undefined
	if (typeof e?.post === 'function' && typeof e.get === 'function')
		return e as Http
	if (
		typeof e?.default?.post === 'function' &&
		typeof e.default.get === 'function'
	)
		return e.default as Http
	return undefined
}

/** What Discord's HTTP returns for a request that went through. A ring is sent and forgotten, so only the shape matters. */
const NOTHING_SENT = () =>
	Promise.resolve({ ok: true, status: 204, body: undefined, headers: {} })

/**
 * Starts stopping the ring request of silent calls.
 *
 * @returns What takes the patch off again.
 */
export function installRingBlock(): () => void {
	const undo: Array<() => void> = []
	const patched = new Set<object>()

	const patch = (exports: unknown) => {
		const http = httpOf(exports)
		if (!http || patched.has(http)) return
		patched.add(http)
		undo.push(
			diag.apply('HTTP.post (ring)', () => {
				const unpatch = valenced.patcher.instead(http, 'post', ((
					args: [{ url?: unknown }, ...unknown[]],
					original: (...passed: unknown[]) => unknown,
				) => {
					const match = RING_URL.exec(String(args[0]?.url ?? ''))
					if (!match) return original(...args)
					if (shouldBeSilent(match[1] as string)) {
						state.silenced++
						diag.log('ring', 'a ring request was stopped')
						return NOTHING_SENT()
					}
					state.rang++
					return original(...args)
				}) as never)
				state.ring = true
				return unpatch
			}),
		)
	}

	undo.push(getModules(withProps('HTTPResponseError', 'get'), patch))
	// The same object by another way, in case the first search does not find it.
	undo.push(getModules(withProps('get', 'post', 'del', 'patch'), patch))

	return () => {
		for (const fn of undo.splice(0)) {
			try {
				fn()
			} catch {
				// Taking a patch off must not stop the others.
			}
		}
		state.ring = false
	}
}
