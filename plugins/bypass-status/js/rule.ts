import { setting } from './config'
import { getChannel } from './discord'
import { readList } from './list'
import type { Message } from './types'

/**
 * Whether a message may bypass Do Not Disturb. This is only the rule for "who": Discord still applies everything else
 * (muted chats, blocked people, your notification settings).
 *
 * A message may bypass if "Everyone" is on, or its author is on the list, or its chat or channel is, or its server is.
 *
 * @param message The new message.
 * @param channelId The channel it was sent in. If not given, the message's own is used.
 */
export function mayBypass(
	message: Message | null | undefined,
	channelId?: string,
): boolean {
	if (!message || !message.author) return false
	if (setting('everyone')) return true
	const list = readList()
	const channel = getChannel((channelId || message.channel_id) as string)
	const guildId = message.guild_id || channel?.guild_id
	return (
		list.users.includes(message.author.id) ||
		list.channels.includes((channelId || message.channel_id) as string) ||
		(!!guildId && list.guilds.includes(guildId))
	)
}
