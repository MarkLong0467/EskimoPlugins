import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { openToast } from '../../../shared/kmmiio/toast'

/** The id of the toasts this plugin shows. */
const TOAST_KEY = 'MARKLONG_AUTO_SHOW_ALL_CHANNELS'

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		openToast(TOAST_KEY, text)
	} catch {
		// Toasts are a convenience.
	}
}

/** A server, as far as this plugin reads it. */
export interface Guild {
	id: string
	name?: string
	features?: { has?(feature: string): boolean }
}

/** The store that knows the servers you are in. */
interface GuildStore {
	getGuild(id: string): Guild | undefined
	getGuilds(): Record<string, Guild>
	getGuildIds?(): string[]
}

/** The store that has your settings for each server. */
interface UserGuildSettingsStore {
	isOptInEnabled(guildId: string): boolean
	getGuildFlags?(guildId: string): number
}

/** One of Discord's Flux stores by name. Nothing if Discord has no such store. */
function store<T>(name: string): T | undefined {
	try {
		return (Stores as unknown as Record<string, T | undefined>)[name]
	} catch {
		return undefined
	}
}

/** The server with this id, if Discord has it loaded. */
export function getGuild(id: string): Guild | undefined {
	return store<GuildStore>('GuildStore')?.getGuild(id)
}

/** Every server you are in. */
export function allGuilds(): Guild[] {
	try {
		return Object.values(store<GuildStore>('GuildStore')?.getGuilds() ?? {})
	} catch {
		return []
	}
}

/** How many servers Discord has loaded. */
export function guildCount(): number {
	return allGuilds().length
}

/** Whether a server is a community server, which is the only kind that has the option. */
export function isCommunity(guild: Guild): boolean {
	try {
		return !!guild.features?.has?.('COMMUNITY')
	} catch {
		return false
	}
}

/**
 * Whether the server hides channels from you. "Show All Channels" is the opposite of Discord's opt-in mode: with the mode on
 * you only see the channels you picked.
 */
export function hidesChannels(guildId: string): boolean {
	try {
		return !!store<UserGuildSettingsStore>(
			'UserGuildSettingsStore',
		)?.isOptInEnabled(guildId)
	} catch {
		return false
	}
}

/** The action creators of opt-in channels, which have the same `setGuildOptIn` Discord's own switch calls. */
interface OptInActions {
	setGuildOptIn(guildId: string, optInEnabled: boolean, location?: string): void
}

/** Discord's `setGuildOptIn`, kept as soon as Discord loads its module. Discord loads modules late, when they are first needed. */
let cachedActions: OptInActions | undefined

/** The function inside what a finder gave: the object itself or its default export. */
function actionsOf(exports: unknown): OptInActions | undefined {
	const found = exports as
		| (Partial<OptInActions> & { default?: Partial<OptInActions> })
		| undefined
	if (typeof found?.setGuildOptIn === 'function') return found as OptInActions
	if (typeof found?.default?.setGuildOptIn === 'function')
		return found.default as OptInActions
	return undefined
}

/** Starts keeping `setGuildOptIn` as Discord loads it. */
export function watchOptIn(
	cleanup: (...fns: Array<() => unknown>) => unknown,
): void {
	cleanup(
		getModules(withProps('setGuildOptIn'), (exports: unknown) => {
			cachedActions = actionsOf(exports) ?? cachedActions
		}),
	)
	cleanup(() => {
		cachedActions = undefined
	})
}

/** Discord's `setGuildOptIn`, if Discord has loaded it. */
export function optInActions(): OptInActions | undefined {
	return cachedActions ?? actionsOf(lookupModule(withProps('setGuildOptIn'))[0])
}

/**
 * The bit of a server's notification flags that is Discord's "channel opt-in mode" (`GuildNotificationSettingsFlags`,
 * `OPT_IN_CHANNELS_ON`). Show All Channels is this bit turned off.
 */
export const OPT_IN_CHANNELS_ON = 16384

/** What this plugin uses of Discord's HTTP object. */
interface Http {
	get?: unknown
	patch(request: { url: string; body: unknown }): unknown
}

/** Discord's HTTP object, kept as soon as Discord loads it (it is the one the HypeSquad Switcher finds, by `HTTPResponseError`). */
let cachedHttp: Http | undefined

function httpOf(exports: unknown): Http | undefined {
	const e = exports as (Partial<Http> & { default?: Partial<Http> }) | undefined
	if (typeof e?.patch === 'function' && typeof e.get === 'function')
		return e as Http
	if (
		typeof e?.default?.patch === 'function' &&
		typeof e.default.get === 'function'
	)
		return e.default as Http
	return undefined
}

/** Starts keeping Discord's HTTP object as Discord loads it. */
export function watchHttp(
	cleanup: (...fns: Array<() => unknown>) => unknown,
): void {
	cleanup(
		getModules(withProps('HTTPResponseError', 'get'), (exports: unknown) => {
			cachedHttp = httpOf(exports) ?? cachedHttp
		}),
	)
	cleanup(() => {
		cachedHttp = undefined
	})
}

/** Discord's HTTP object, if Discord has loaded it. */
function discordHttp(): Http | undefined {
	return (
		cachedHttp ??
		httpOf(lookupModule(withProps('HTTPResponseError', 'get'))[0]) ??
		httpOf(lookupModule(withProps('get', 'post', 'del', 'patch'))[0])
	)
}

/**
 * Turns Show All Channels on for a server by changing its notification flags the way Discord does: the stores are told
 * (`USER_GUILD_SETTINGS_GUILD_UPDATE`, which is what makes the app show it at once), and the setting is saved with
 * `PATCH /users/@me/guilds/<id>/settings`. This is what `setGuildOptIn` ends in, without needing that function, which Discord
 * only loads when it is first used.
 *
 * @returns Whether it was sent. Nothing is sent if the server's flags or Discord's HTTP object are not there.
 */
export function showAllByFlags(guildId: string): boolean {
	const flags = store<UserGuildSettingsStore>(
		'UserGuildSettingsStore',
	)?.getGuildFlags?.(guildId)
	const http = discordHttp()
	if (typeof flags !== 'number' || !http) return false
	// OPT_IN_CHANNELS_ON is turned off, and every other bit is kept.
	const next = flags - (flags & OPT_IN_CHANNELS_ON)
	Dispatcher.dispatch({
		type: 'USER_GUILD_SETTINGS_GUILD_UPDATE',
		guildId,
		settings: { flags: next },
	})
	const sent = http.patch({
		url: `/users/@me/guilds/${guildId}/settings`,
		body: { flags: next },
	})
	// A refusal arrives later; it is only noted.
	;(
		sent as { catch?: (handler: (error: unknown) => void) => void } | undefined
	)?.catch?.(error =>
		console.warn('[auto-show-all-channels] save refused:', String(error)),
	)
	return true
}
