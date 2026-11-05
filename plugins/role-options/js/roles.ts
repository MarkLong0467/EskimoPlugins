import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { state } from './state'
import type { Role } from './types'

/**
 * A Flux store by name, or, if Discord has no store of that name, any module that has the property `prop`.
 * The stores used here are described locally because `Stores` is typed loosely (every store is `Store<object>`).
 */
function store<T>(name: string, prop: string): T | undefined {
	const found = Stores[name] as unknown as T | undefined
	return found || (lookupModule(withProps(prop))[0] as unknown as T | undefined)
}

interface RoleStore {
	getRole(guildId: string, roleId: string): Role | undefined
}

/**
 * Finds a role by its id.
 *
 * A role id does not say which server it belongs to, so every candidate server is tried: first the one the last menu
 * was in, then the server that is open, then every server the account is in.
 *
 * @returns The role, or nothing if no server has it.
 */
export function lookupRole(
	roleId: string | null | undefined,
): Role | undefined {
	const roles = store<RoleStore>('GuildRoleStore', 'getSortedRoles')
	if (!roles || !roleId) return undefined

	let guilds: Array<string | undefined> = []
	try {
		guilds.push(
			store<{ getGuildId(): string }>(
				'SelectedGuildStore',
				'getGuildId',
			)?.getGuildId(),
		)
	} catch {
		// No server is open.
	}
	if (state.seen.guildId) guilds.unshift(state.seen.guildId)
	try {
		guilds = guilds.concat(
			Object.keys(
				store<{ getGuilds(): object }>(
					'GuildStore',
					'getGuilds',
				)?.getGuilds() ?? {},
			),
		)
	} catch {
		// The list of servers is not available.
	}

	for (const guild of guilds) {
		const role = guild && roles.getRole(guild, roleId)
		if (role) return role
	}
	return undefined
}
