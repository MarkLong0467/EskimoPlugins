import { kmmiio } from './kmmiio'
import {
	findFunctionByName,
	findModuleByProps,
	findModuleByPropsUsingStore,
} from './metro'
import { getFluxStore, getME, haptic } from './modules'

const TAG = '[ServerDrawer.Nav]'

const HOME_PATH = '/channels/@me'

let guildNavigation: any
let channelNavigation: any
let guildBarNavigation: ((id: string) => void) | undefined
let routerNavigation: any

// Mirrors the working serverdrawer (revenge-plugins) navigation:
//   selectGuild(id)           -> guildBarNavigation?.(id) else transitionToGuild(id)
//   selectPrivateChannel(id)  -> transitionToChannel(id, {})
// Resolved lazily per-tap so lazy chunks that load later still get used.
function resolveNavigation(): void {
	try {
		if (!guildNavigation) {
			guildNavigation = findModuleByProps('transitionToGuild')
		}
	} catch {
		// ignore
	}
	try {
		if (!channelNavigation) {
			channelNavigation = findModuleByPropsUsingStore(
				'ChannelStore',
				'transitionToChannel',
			)
		}
	} catch {
		// ignore
	}
	try {
		if (!guildBarNavigation) {
			guildBarNavigation = findFunctionByName(
				'transitionGuildsBarToGuildOrOpenSelectedChannel',
			)
		}
	} catch {
		// ignore
	}
	try {
		if (!routerNavigation) {
			routerNavigation = findModuleByProps('transitionTo')
		}
	} catch {
		// ignore
	}
}

export function startNavigation(): void {
	resolveNavigation()
	if (guildBarNavigation) {
		console.log(TAG, 'nav-bind: rail util default')
	}
	if (guildNavigation?.transitionToGuild) {
		console.log(TAG, 'nav-bind: transitionToGuild')
	}
	if (channelNavigation?.transitionToChannel) {
		console.log(TAG, 'nav-bind: transitionToChannel')
	}
}

function selectedGuild(): string | undefined {
	try {
		return getFluxStore('SelectedGuildStore')?.getGuildId?.()
	} catch {
		return undefined
	}
}

function selectedChannel(): string | undefined {
	try {
		return getFluxStore('SelectedChannelStore')?.getChannelId?.()
	} catch {
		return undefined
	}
}

// On the home / DM rail the selected guild resolves to null, not an id.
function reachedTarget(guildId: string, sel: string | undefined): boolean {
	if (guildId === '@me') return sel == null || sel === '@me'
	return sel === guildId
}

export function switchGuild(guildId: string): void {
	haptic('SOFT')
	resolveNavigation()

	if (typeof guildBarNavigation === 'function') {
		console.log(TAG, `sw->${guildId} via=rail-util`)
		try {
			guildBarNavigation(guildId)
		} catch (e) {
			console.warn(TAG, `sw->${guildId} rail threw ${String(e)}`)
		}
	} else if (guildNavigation?.transitionToGuild) {
		console.log(TAG, `sw->${guildId} via=transitionToGuild`)
		try {
			guildNavigation.transitionToGuild(guildId)
		} catch (e) {
			console.warn(TAG, `sw->${guildId} threw ${String(e)}`)
		}
	} else {
		console.log(TAG, `sw->${guildId} via=none`)
	}

	setTimeout(() => {
		const sel = selectedGuild()
		if (reachedTarget(guildId, sel)) {
			console.log(TAG, `dst=OK sel=${sel ?? 'none'}`)
			return
		}
		console.log(TAG, `dst=MISS sel=${sel ?? 'none'}`)
	}, 900)
}

export function openDms(): void {
	haptic('SOFT')
	resolveNavigation()

	const me = getME()
	const goHome = (): void => {
		try {
			if (typeof routerNavigation?.transitionTo === 'function') {
				console.log(TAG, `dms->home via=transitionTo`)
				routerNavigation.transitionTo(HOME_PATH)
				return
			}
			if (typeof guildBarNavigation === 'function' && me) {
				console.log(TAG, `dms->home via=rail-util`)
				guildBarNavigation(me)
				return
			}
			if (me && guildNavigation?.transitionToGuild) {
				console.log(TAG, `dms->home via=transitionToGuild`)
				guildNavigation.transitionToGuild(me)
				return
			}
			console.warn(TAG, 'openDms: no navigation target resolved')
		} catch (e) {
			console.warn(TAG, `openDms: threw ${String(e)}`)
		}
	}

	goHome()

	setTimeout(() => {
		const guildId = selectedGuild()
		const channelId = selectedChannel()
		// The DMs list page has no guild and no DM channel selected.
		const home = guildId == null && channelId == null
		console.log(
			TAG,
			`dst=${home ? 'OK' : 'MISS'} guild=${guildId ?? 'none'} channel=${channelId ?? 'none'}`,
		)
	}, 900)
}

/**
 * The create-guild modal this plugin opens.
 *
 * The library resolves sheets generically, so each plugin declares the ones it
 * owns. Stable object because the library memoizes per spec.
 */
const CREATE_GUILD_SHEET = {
	prop: 'openCreateGuildModal',
	anchor: 'pushLazy',
} as const

/** Warms the modal without opening one, so the first tap is not wasted. */
export function forceLoadCreateGuild(): void {
	kmmiio()?.resolveSheet?.(CREATE_GUILD_SHEET)
}

export function createGuild(): void {
	haptic('SOFT')

	const open = kmmiio()?.resolveSheet?.(CREATE_GUILD_SHEET)
	if (typeof open !== 'function') {
		console.warn(TAG, 'create: no opener available - no-op')
		return
	}

	console.log(TAG, 'create: firing (kmmiio)')
	try {
		open()
	} catch (e) {
		console.warn(TAG, `create: threw ${String(e)}`)
	}
}

export function toggleFolder(folderId: string): void {
	haptic('SOFT')

	const mod = findModuleByProps('toggleGuildFolderExpand') as
		| Record<string, any>
		| undefined
	const toggle =
		mod?.toggleGuildFolderExpand ??
		(mod?.default as any)?.toggleGuildFolderExpand

	if (typeof toggle === 'function') {
		console.log(TAG, `folder->${folderId}`)
		try {
			toggle(folderId)
		} catch (e) {
			console.warn(TAG, `folder->${folderId} threw ${String(e)}`)
		}
	} else {
		console.warn(
			TAG,
			`folder->${folderId} dispatching TOGGLE_GUILD_FOLDER_EXPAND`,
		)
		try {
			void (valenced as any).discord.common.flux.Dispatcher.dispatch({
				type: 'TOGGLE_GUILD_FOLDER_EXPAND',
				folderId,
			})
		} catch (e) {
			console.warn(TAG, `folder->${folderId} dispatch failed ${String(e)}`)
		}
	}

	setTimeout(() => {
		let has: boolean | undefined
		try {
			has =
				getFluxStore('ExpandedGuildFolderStore')
					?.getExpandedFolders?.()
					?.has(folderId) ?? false
		} catch {
			// ignore
		}
		console.log(
			TAG,
			`fold=${has === true ? 'OPEN' : 'CLOSED'} folderId=${folderId}`,
		)
	}, 350)
}

export function logStatus(): void {
	resolveNavigation()

	const me = getME() ?? '?'
	const nav = guildBarNavigation
		? 'rail-util'
		: guildNavigation?.transitionToGuild
			? 'transitionToGuild'
			: 'MISS'
	const navRef =
		typeof findModuleByProps('getRootNavigationRef')?.getRootNavigationRef ===
		'function'
			? 'yes'
			: 'no'
	const create =
		typeof kmmiio()?.resolveSheet?.(CREATE_GUILD_SHEET) === 'function'
			? 'lib'
			: 'no-lib'
	const toggle = findModuleByProps('toggleGuildFolderExpand')
	const folder = toggle ? 'loaded' : 'MISS'

	console.log(
		TAG,
		`status me=${me} nav=${nav} navRef=${navRef} create=${create} folder=${folder}`,
	)
}
