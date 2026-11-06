import { Dispatcher } from '@valenced/discord/common/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { diag } from './diag'
import { state } from './state'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** How long the same channels are not cleared again (milliseconds), since Discord may draw the section again at once. */
const AGAIN_MS = 4000

/** Discord's own function, once it has been found. */
type ClearRecentChannels = (guildId: string, channelIds: string[]) => void
let found: ClearRecentChannels | undefined

/** What was cleared lately, so a second draw before Discord has updated does not clear it again. */
const lately = new Map<string, number>()

/** The module that has `clearRecentChannels`, if it is loaded. Discord loads it late, the first time it is needed. */
function look(): ClearRecentChannels | undefined {
	const exports = lookupModule(withProps('clearRecentChannels'))[0] as
		| { clearRecentChannels?: ClearRecentChannels }
		| undefined
	return typeof exports?.clearRecentChannels === 'function'
		? exports.clearRecentChannels
		: undefined
}

/** Whether Discord's own `clearRecentChannels` has been found. */
export const hasDiscordClear = (): boolean => !!(found ?? look())

/** Starts looking for Discord's `clearRecentChannels`, which turns up when Discord first loads its module. */
export function watchForClear(cleanup: Cleanup): void {
	found = diag.guard('find clearRecentChannels', look)
	cleanup(
		getModules(withProps('clearRecentChannels'), (exports: unknown) => {
			const module = exports as {
				clearRecentChannels?: ClearRecentChannels
				default?: { clearRecentChannels?: ClearRecentChannels }
			}
			found =
				module.clearRecentChannels ??
				module.default?.clearRecentChannels ??
				found
		}),
	)
	cleanup(() => {
		found = undefined
		lately.clear()
	})
}

/**
 * Clears the suggestions of a server.
 *
 * What Discord's own `clearRecentChannels` does is save that you dismissed them, tell the stores with a `BULK_CLEAR_RECENTS`
 * event, and mark the channels as read. The event is what removes the channels from the list, and needs no module, so it is
 * always sent. Discord's own function is used too when it has been found, because it also saves the dismissal.
 *
 * It runs a moment later, not in the middle of drawing, so the stores are not changed while a component is being drawn.
 */
export function clearSuggestions(guildId: string, channelIds: string[]): void {
	const key = `${guildId}:${channelIds.join(',')}`
	const now = Date.now()
	const last = lately.get(key)
	if (last !== undefined && now - last < AGAIN_MS) return
	lately.set(key, now)
	if (lately.size > 50) lately.delete(lately.keys().next().value as string)

	setTimeout(() => {
		diag.guard('clear', () => {
			const own = found ?? look()
			if (own) {
				own(guildId, channelIds)
				state.clearedByDiscord++
				return
			}
			Dispatcher.dispatch({
				type: 'BULK_CLEAR_RECENTS',
				guildId,
				channelIds,
			})
			state.clearedByEvent++
		})
	}, 0)
}
