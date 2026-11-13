import { ToastActionCreators } from '@valenced/discord/actions'
import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { diag } from './diag'
import type { Tab } from './config'

/** The parts of a channel that the tabs use. */
interface ChannelLike {
	id: string
	name?: string
	guild_id?: string | null
	recipients?: string[]
	isPrivate?: () => boolean
	isThread?: () => boolean
}

/** The parts of a user that a name is made from. */
interface UserLike {
	globalName?: string | null
	username?: string
}

/** One of Discord's Flux stores by name, described by the type the caller gives. */
function store<T>(name: string): T | undefined {
	try {
		return (Stores as unknown as Record<string, T | undefined>)[name]
	} catch {
		return undefined
	}
}

/** Discord's channel, if it has it loaded. */
function channelOf(id: string): ChannelLike | undefined {
	try {
		return (
			store<{ getChannel?: (id: string) => ChannelLike | undefined }>(
				'ChannelStore',
			)?.getChannel?.(id) ?? undefined
		)
	} catch {
		return undefined
	}
}

/** The text of a tab: a name with a mark for what kind of channel it is. A DM is named after the people in it. */
export function labelOf(tab: Tab): string {
	const channel = channelOf(tab.id)
	if (!channel) return tab.name
	try {
		if (channel.isPrivate?.()) {
			const users = store<{ getUser?: (id: string) => UserLike | undefined }>(
				'UserStore',
			)
			const names = (channel.recipients ?? [])
				.map(id => {
					const user = users?.getUser?.(id)
					return user?.globalName || user?.username
				})
				.filter(Boolean)
			return `@${channel.name || names.join(', ') || tab.name}`
		}
		const name = channel.name || tab.name
		return channel.isThread?.() ? `🧵 ${name}` : `#${name}`
	} catch {
		return tab.name
	}
}

/** What to save for a channel, from its id (and the server the screen says it is in, if Discord does not know the channel). */
export function tabFor(id: string, guildId: string | null | undefined): Tab {
	const channel = channelOf(id)
	const name =
		channel?.name ||
		(channel?.recipients ?? [])
			.map(user => {
				const found = store<{ getUser?: (id: string) => UserLike | undefined }>(
					'UserStore',
				)?.getUser?.(user)
				return found?.globalName || found?.username
			})
			.filter(Boolean)
			.join(', ') ||
		'channel'
	return { id, guildId: channel?.guild_id ?? guildId ?? null, name }
}

/** Looks for a module with these exports, described by the type the caller gives. */
function findByProps<T>(...props: string[]): T | undefined {
	try {
		return lookupModule(
			(withProps as (...names: string[]) => ReturnType<typeof withProps>)(
				...props,
			),
		)[0] as unknown as T | undefined
	} catch {
		return undefined
	}
}

/** Opens a channel on the screen, the way a tap on it in the channel list does. Whether Discord took it. */
export function openChannel(tab: Tab): boolean {
	const to = findByProps<{
		transitionToChannel?: (id: string, options?: object) => unknown
	}>('transitionToChannel')
	if (typeof to?.transitionToChannel === 'function') {
		try {
			to.transitionToChannel(tab.id, {})
			return true
		} catch (error) {
			diag.log('open', `transitionToChannel failed: ${String(error)}`, 'warn')
		}
	}
	const router = findByProps<{ transitionTo?: (path: string) => unknown }>(
		'transitionTo',
	)
	if (typeof router?.transitionTo === 'function') {
		try {
			router.transitionTo(`/channels/${tab.guildId ?? '@me'}/${tab.id}`)
			return true
		} catch (error) {
			diag.log('open', `transitionTo failed: ${String(error)}`, 'warn')
		}
	}
	diag.log('open', 'nothing found that can open a channel', 'warn')
	return false
}

/**
 * Loads a channel's messages. Discord loads them for the channel that is selected only, so the chat in the second half of a
 * split would wait for them forever; this asks Discord's message manager for them the way Discord's own second chat (the one
 * beside an app's channel) does. Whether it could.
 */
export function loadMessages(tab: Tab): boolean {
	const manager = findByProps<{
		fetchMessages?: (options: object) => unknown
	}>('fetchMessages', 'loadSelectedChannelIfNecessary')
	if (typeof manager?.fetchMessages !== 'function') {
		diag.log('messages', 'no message manager found', 'warn')
		return false
	}
	try {
		manager.fetchMessages({ guildId: tab.guildId, channelId: tab.id })
		return true
	} catch (error) {
		diag.log('messages', `fetchMessages failed: ${String(error)}`, 'warn')
		return false
	}
}

/** Shows a toast. A toast that cannot be shown is not worth failing over. */
export function toast(text: string): void {
	try {
		ToastActionCreators.open('MARKLONG_CHANNEL_TABS', { text })
	} catch {
		// Toasts are a convenience.
	}
}
