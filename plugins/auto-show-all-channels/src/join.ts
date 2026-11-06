import { onFluxEventDispatched } from '@valenced/discord/flux'
import { showAllIn } from './apply'
import { isHandled, store } from './config'
import { diag } from './diag'
import { getGuild, guildCount } from './discord'
import { state } from './state'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** How long after a join Discord is given to load the server before it is looked at (milliseconds). */
const FIRST_DELAY_MS = 1500

/** How long to wait between looks while the server is not loaded yet (milliseconds). */
const RETRY_DELAY_MS = 2000

/** How many times the server is looked for. */
const MAX_ATTEMPTS = 8

/**
 * How long after Discord connects the plugin waits before it treats a server it has not seen as a new one (milliseconds).
 * When Discord connects it sends every server you are in, and those are not joins.
 */
const SETTLE_MS = 20_000

/**
 * Watches for servers you join and turns on Show All Channels in each one, once.
 *
 * Two events tell about a join: `GUILD_JOIN`, which Discord sends when you accept an invite or join from Discover, and
 * `GUILD_CREATE`, which the server is sent in. `GUILD_CREATE` is also sent for every server when Discord connects, so one
 * counts as a join only if Discord did not know the server before and has finished connecting.
 *
 * @param cleanup Where to register what stops the watching.
 */
export function watchJoins(cleanup: Cleanup): void {
	/** Servers `GUILD_JOIN` told about, which are looked at when their `GUILD_CREATE` comes. */
	const pending = new Set<string>()
	/** Servers you are only previewing (lurking in) without having joined. They are left alone. */
	const lurking = new Set<string>()
	/** Servers that are being looked at now. */
	const scheduled = new Set<string>()
	const timers = new Set<ReturnType<typeof setTimeout>>()

	const later = (fn: () => void, ms: number) => {
		const timer = setTimeout(() => {
			timers.delete(timer)
			fn()
		}, ms)
		timers.add(timer)
	}

	// With servers already loaded the plugin was started in a running app, so joins count at once. At a cold start the
	// servers come later, and joins count only after Discord has settled.
	state.armed = guildCount() > 0

	/** Looks at a server a moment after its join, and again if Discord has not loaded it yet. */
	const attempt = (guildId: string, n: number) => {
		later(
			() => {
				const outcome = showAllIn(guildId, 'joined')
				if (outcome === 'not loaded' && n < MAX_ATTEMPTS)
					attempt(guildId, n + 1)
				else scheduled.delete(guildId)
			},
			n === 0 ? FIRST_DELAY_MS : RETRY_DELAY_MS,
		)
	}

	const consider = (guildId: string) => {
		if (!store.get('enabled') || isHandled(guildId) || scheduled.has(guildId))
			return
		scheduled.add(guildId)
		attempt(guildId, 0)
	}

	cleanup(
		onFluxEventDispatched<{ guildId?: string; lurker?: boolean }>(
			'GUILD_JOIN',
			payload => {
				try {
					if (payload?.guildId && payload.lurker) {
						// A lurker is looking at a server without joining it.
						lurking.add(payload.guildId)
					} else if (payload?.guildId) {
						lurking.delete(payload.guildId)
						state.joins++
						pending.add(payload.guildId)
						diag.log('join', 'GUILD_JOIN')
					}
				} catch (error) {
					diag.fail('GUILD_JOIN', error)
				}
				return payload
			},
		),
	)

	cleanup(
		onFluxEventDispatched<{ guild?: { id?: string } }>(
			'GUILD_CREATE',
			payload => {
				try {
					const id = payload?.guild?.id
					if (!id) return payload
					if (lurking.has(id)) return payload
					if (pending.delete(id)) consider(id)
					// This runs before Discord stores the server, so a server it has no record of is a new one.
					else if (state.armed && !getGuild(id)) {
						state.joins++
						diag.log('join', 'GUILD_CREATE for a server Discord did not have')
						consider(id)
					}
				} catch (error) {
					diag.fail('GUILD_CREATE', error)
				}
				return payload
			},
		),
	)

	cleanup(
		onFluxEventDispatched('CONNECTION_OPEN', payload => {
			// Every server is sent again, so joins are not counted until that is over.
			state.armed = false
			later(() => {
				state.armed = guildCount() > 0
			}, SETTLE_MS)
			return payload
		}),
	)

	cleanup(() => {
		for (const timer of timers) clearTimeout(timer)
		timers.clear()
		pending.clear()
		lurking.clear()
		scheduled.clear()
	})
}
