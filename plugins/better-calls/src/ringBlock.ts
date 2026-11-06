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

/** What this plugin reads of an HTTP object and of a request. */
interface Http {
	post(request: { url?: unknown; body?: unknown }, ...rest: unknown[]): unknown
}

/**
 * Every object in what a finder gave that has a `post` Discord might call.
 *
 * Discord's HTTP module (`HTTPUtils`) exports `post` twice: as a function of the module itself, and in an object
 * `HTTP = { get, post, put, patch, del }` that holds its own copies. The call code uses `HTTPUtils.HTTP.post`, so patching only
 * the module's own `post` misses it. The finders only look at module roots, so the nested object is reached from there.
 */
function httpObjectsOf(exports: unknown): Http[] {
	const e = exports as
		| {
				post?: unknown
				HTTP?: { post?: unknown }
				default?: { post?: unknown; HTTP?: { post?: unknown } }
		  }
		| null
		| undefined
	const candidates = [e, e?.HTTP, e?.default, e?.default?.HTTP]
	return candidates.filter(
		(candidate): candidate is Http =>
			!!candidate && typeof candidate.post === 'function',
	)
}

/** What Discord's HTTP returns for a request that went through. A ring is sent and forgotten, so only the shape matters. */
const NOTHING_SENT = () =>
	Promise.resolve({ ok: true, status: 204, body: undefined, headers: {} })

/** How many requests about calls are written to the log, so a report shows what Discord sends without filling up. */
const LOGGED_CALL_REQUESTS = 25

/** A request's address with the ids taken out, so it can be logged. */
const withoutIds = (url: string) => url.replace(/\d{5,}/g, '<id>')

/**
 * Starts stopping the ring request of silent calls.
 *
 * @returns What takes the patch off again.
 */
export function installRingBlock(): () => void {
	const undo: Array<() => void> = []
	const patched = new Set<object>()

	const patch = (exports: unknown) => {
		for (const http of httpObjectsOf(exports)) {
			if (patched.has(http)) continue
			patched.add(http)
			undo.push(
				diag.apply('HTTP.post (ring)', () => {
					const unpatch = valenced.patcher.instead(http, 'post', ((
						args: [{ url?: unknown }, ...unknown[]],
						original: (...passed: unknown[]) => unknown,
					) => {
						const url = String(args[0]?.url ?? '')
						const match = RING_URL.exec(url)
						if (!match) {
							// What Discord sends about calls is noted, to see what a call does if a ring is not caught.
							if (
								url.includes('/call') &&
								state.callRequests < LOGGED_CALL_REQUESTS
							) {
								state.callRequests++
								diag.log('http', `POST ${withoutIds(url)}`)
							}
							return original(...args)
						}
						if (shouldBeSilent(match[1] as string)) {
							state.silenced++
							diag.log('ring', 'a ring request was stopped')
							return NOTHING_SENT()
						}
						state.rang++
						diag.log('ring', 'a ring request was sent')
						return original(...args)
					}) as never)
					state.ring = true
					state.httpPatched++
					return unpatch
				}),
			)
		}
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
		state.httpPatched = 0
	}
}
