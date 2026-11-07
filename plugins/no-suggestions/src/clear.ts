import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { diag } from './diag'
import { state } from './state'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** How long the same channels are not cleared again (milliseconds), since Discord may draw the section again at once. */
const AGAIN_MS = 4000

/**
 * Where Discord keeps the pieces, from Discord's own source (the datamined `discord_app` files).
 *
 * `clearRecentChannels(guildId, channelIds)` is what its "Clear" option on the Suggested header calls. It does three things:
 * `bulkClearRecents` (saves `guildRecentsDismissedAt` in your server settings and sends `BULK_CLEAR_RECENTS`), `bulkAck`
 * (marks those channels as read) and, with a third argument, opens a channel. The rows of the section are the channels that
 * are unread, mention you, are new, or were visited lately, so the event alone leaves most of them there.
 */
const PATH_CLEAR = 'modules/opt_in_channels/OptInChannelsUtils.tsx'

/** A function that clears the suggestions of a server. */
type ClearRecentChannels = (guildId: string, channelIds: string[]) => unknown

let found: ClearRecentChannels | undefined

/** What was cleared lately, so a second draw before Discord has updated does not clear it again. */
const lately = new Map<string, number>()

/** The function a module's exports hold under a name, on the exports or on their default export. */
function pick<T>(exports: unknown, name: string): T | undefined {
	const module = exports as Record<string, unknown> & {
		default?: Record<string, unknown>
	}
	const fn = module?.[name] ?? module?.default?.[name]
	return typeof fn === 'function' ? (fn as T) : undefined
}

/** Valenced's helpers that look modules up by the path of their file, if this version has them. */
function pathFinders():
	| {
			lookupModuleWithImportedPath?: (path: string) => unknown[]
			getModuleWithImportedPath?: (
				path: string,
				callback: (exports: unknown) => void,
			) => () => void
	  }
	| undefined {
	return (
		valenced as unknown as {
			discord?: { utils?: { modules?: { finders?: never } } }
		}
	).discord?.utils?.modules?.finders
}

/** Looks a function up by its name on any module. */
function lookByName<T>(name: string): T | undefined {
	const [exports] = lookupModule(withProps(name), {
		initialize: true,
	}) as unknown as [unknown?]
	return exports ? pick<T>(exports, name) : undefined
}

/** Looks a function up in the module with this file path. */
function lookByPath<T>(path: string, name: string): T | undefined {
	const [exports] = (pathFinders()?.lookupModuleWithImportedPath?.(path) ??
		[]) as [unknown?]
	return exports ? pick<T>(exports, name) : undefined
}

/**
 * Looks for Discord's `clearRecentChannels`, by its name and then by the path of its file, and notes which worked.
 * Discord loads the module late, the first time it is needed, so this is tried again whenever something is cleared.
 */
function look(): ClearRecentChannels | undefined {
	const byName = diag.guard('look by name', () =>
		lookByName<ClearRecentChannels>('clearRecentChannels'),
	)
	if (byName) {
		state.how = 'by its name'
		return byName
	}
	const byPath = diag.guard('look by path', () =>
		lookByPath<ClearRecentChannels>(PATH_CLEAR, 'clearRecentChannels'),
	)
	if (byPath) {
		state.how = 'by its file path'
		return byPath
	}
	return undefined
}

/** Whether Discord's own `clearRecentChannels` has been found. */
export const hasDiscordClear = (): boolean => !!(found ?? look())

/** Starts looking for Discord's `clearRecentChannels`, which turns up when Discord first loads its module. */
export function watchForClear(cleanup: Cleanup): void {
	found = diag.guard('find clearRecentChannels', look)
	cleanup(
		getModules(withProps('clearRecentChannels'), (exports: unknown) => {
			found = pick<ClearRecentChannels>(exports, 'clearRecentChannels') ?? found
			if (found) state.how = 'when Discord loaded it'
		}),
	)
	// The same module by the path of its file, for a version where the name is not found.
	const finders = diag.guard('path watcher', () => pathFinders())
	if (finders?.getModuleWithImportedPath) {
		cleanup(
			diag.guard(
				'watch for the file',
				() =>
					finders.getModuleWithImportedPath?.(PATH_CLEAR, exports => {
						found =
							pick<ClearRecentChannels>(exports, 'clearRecentChannels') ?? found
						if (found) state.how = 'by its file path, when Discord loaded it'
					}) ?? (() => {}),
			) ?? (() => {}),
		)
	}
	cleanup(() => {
		found = undefined
		lately.clear()
		dismissedAt.clear()
	})
}

/**
 * What Discord's own function does, done here when the function cannot be found, using only the event stream and the stores
 * (both always there):
 * - `BULK_CLEAR_RECENTS` tells the stores that hold the new channels and the section to forget them,
 * - `BULK_ACK` marks the channels read here (without `context`, so Discord does not send the read to its servers),
 * - the dismissal time (see `installDismissal`) takes the rest out: the channels that were visited lately.
 */
function clearByEvents(guildId: string, channelIds: string[]): void {
	Dispatcher.dispatch({
		type: 'BULK_CLEAR_RECENTS',
		guildId,
		channelIds,
	})
	state.clearedByEvent++
	const readState = (
		Stores as unknown as {
			ReadStateStore?: { lastMessageId?: (channelId: string) => string }
		}
	).ReadStateStore
	diag.guard('mark the channels read', () => {
		Dispatcher.dispatch({
			type: 'BULK_ACK',
			channels: channelIds.map(channelId => ({
				channelId,
				// 0 is Discord's `ReadStateTypes.CHANNEL`.
				readStateType: 0,
				messageId: readState?.lastMessageId?.(channelId),
			})),
		})
	})
	state.acked += channelIds.length
}

/** When each server's suggestions were last dismissed here (milliseconds), by server id. */
const dismissedAt = new Map<string, number>()

/**
 * Makes Discord count the suggestions as dismissed. Whether a channel is in the Suggested section is decided by Discord's
 * `UserSettingsProtoStore.getGuildRecentsDismissedAt(guildId)`: a channel that was only visited lately, or is new, is left out
 * once it is older than that time. Discord's own Clear saves a new time in your server settings; this plugin keeps its own for
 * the server and returns the later of the two, so the section stays empty without changing your saved settings.
 */
export function installDismissal(cleanup: Cleanup): void {
	const store = (
		Stores as unknown as {
			UserSettingsProtoStore?: {
				getGuildRecentsDismissedAt?: (guildId: string) => number
			}
		}
	).UserSettingsProtoStore
	if (typeof store?.getGuildRecentsDismissedAt !== 'function') {
		diag.log('patch', 'UserSettingsProtoStore was not found', 'warn')
		return
	}
	const unpatch = diag.apply('getGuildRecentsDismissedAt', () =>
		valenced.patcher.instead(
			store as never,
			'getGuildRecentsDismissedAt' as never,
			((args: [string], original: (guildId: string) => number) => {
				const real = original(args[0])
				const mine = dismissedAt.get(args[0])
				return mine !== undefined && mine > real ? mine : real
			}) as never,
		),
	)
	state.dismissal = !!unpatch
	if (unpatch) cleanup(unpatch)
}

/**
 * Clears the suggestions of a server, the way Discord's own "Clear" option does.
 *
 * Discord's own `clearRecentChannels` is used when it is found. If not, the events and the dismissal time do the same (see
 * `clearByEvents` and `installDismissal`). It runs a moment later, not in the middle of drawing, so the stores are not changed
 * while a component is being drawn.
 */
export function clearSuggestions(guildId: string, channelIds: string[]): void {
	const key = `${guildId}:${channelIds.join(',')}`
	const now = Date.now()
	const last = lately.get(key)
	if (last !== undefined && now - last < AGAIN_MS) return
	lately.set(key, now)
	dismissedAt.set(guildId, now)
	if (lately.size > 50) lately.delete(lately.keys().next().value as string)

	setTimeout(() => {
		diag.guard('clear', () => {
			const own = found ?? look()
			if (own) {
				found = own
				own(guildId, channelIds)
				state.clearedByDiscord++
				return
			}
			clearByEvents(guildId, channelIds)
		})
	}, 0)
}

/**
 * Notes that the section was drawn again with channels after they were cleared, which means the clear did not take.
 *
 * @returns Whether it is a repeat of a clear that was sent a moment ago and did not work.
 */
export function noteStillShown(guildId: string, channelIds: string[]): boolean {
	const key = `${guildId}:${channelIds.join(',')}`
	const last = lately.get(key)
	return last !== undefined && Date.now() - last > AGAIN_MS
}

/**
 * What can be found right now, for the report: Discord's `clearRecentChannels`, its parts, and Valenced's path lookup. Each is
 * looked up fresh, so the report shows whether the module has been loaded by the time it is copied.
 */
export function probe(): Record<string, string> {
	const yes = (value: unknown) => (value ? 'found' : 'not found')
	return {
		'clearRecentChannels (by name)': yes(
			diag.guard('probe name', () => lookByName('clearRecentChannels')),
		),
		'clearRecentChannels (by file path)': yes(
			diag.guard('probe path', () =>
				lookByPath(PATH_CLEAR, 'clearRecentChannels'),
			),
		),
		UserSettingsProtoStore: (
			Stores as unknown as { UserSettingsProtoStore?: unknown }
		).UserSettingsProtoStore
			? 'found'
			: 'not found',
		'dismissal patch': state.dismissal ? 'installed' : 'not installed',
		'Valenced path lookup': pathFinders()?.lookupModuleWithImportedPath
			? 'available'
			: 'not available',
	}
}
