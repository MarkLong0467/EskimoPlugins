import { onFluxEventDispatched } from '@valenced/discord/flux'
import { FRIENDS_TIMEOUT_MS } from './constants'
import { findByProps, store } from './discord'
import type {
	Actions,
	Friend,
	MemberStore,
	RelationshipStore,
	UserStore,
} from './types'

/**
 * The friends you have in a server.
 *
 * Discord only knows the members it has loaded, so it is asked for the members who are your friends first
 * (`requestMembersById`) and the answer (`GUILD_MEMBERS_CHUNK`) is waited for, but for no longer than `timeoutMs`.
 * Then every friend who is a member is listed.
 *
 * @param guildId The server.
 * @param timeoutMs How long to wait for Discord's answer.
 * @returns The friends, or an empty list if you have none.
 */
export async function getGuildFriends(
	guildId: string,
	timeoutMs: number = FRIENDS_TIMEOUT_MS,
): Promise<Friend[]> {
	const friendIds =
		store<RelationshipStore>('RelationshipStore')?.getFriendIDs?.() || []
	if (!friendIds.length) return []

	findByProps<Actions<'requestMembersById'>>(
		'requestMembersById',
	)?.requestMembersById?.(guildId, friendIds)

	await new Promise<void>(resolve => {
		let timer: ReturnType<typeof setTimeout>
		let off: (() => unknown) | undefined
		const finish = () => {
			clearTimeout(timer)
			if (off) off()
			resolve()
		}
		off = onFluxEventDispatched<{ guildId?: string; guild_id?: string }>(
			'GUILD_MEMBERS_CHUNK',
			payload => {
				if (
					payload &&
					(payload.guildId === guildId || payload.guild_id === guildId)
				)
					setTimeout(finish, 0)
				return payload
			},
		)
		timer = setTimeout(finish, timeoutMs)
	})

	const members = store<MemberStore>('GuildMemberStore')
	const users = store<UserStore>('UserStore')
	const all = members?.getMembers?.(guildId) || {}
	const out: Friend[] = []
	for (const id of friendIds) {
		const member = all[id] || members?.getMember?.(guildId, id)
		if (!member) continue
		const user = users?.getUser(id)
		out.push({
			id,
			username: user?.username || null,
			globalName: user?.globalName || null,
			nick: member.nick || null,
		})
	}
	return out
}
