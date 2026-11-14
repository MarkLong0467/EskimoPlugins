/**
 * I Remember You.
 *
 * Locally saves everyone you've been communicating with (including servers), in case of loss: the people you mention or
 * reply to, the owner of every server you are in, and the members of the servers you own.
 *
 * A port of IRememberYou for Equicord by zoodogood, keircn and tt (https://equicord.org/plugins/IRememberYou). Equicord
 * hears a message before it is sent through its MessageEvents API; here Discord's `sendMessage` is wrapped instead, and
 * the reply it carries (`messageReference`) is handed over as Equicord's `replyOptions`. The list is the plugin's settings
 * screen, where Equicord adds a tab to its settings.
 *
 * How it is put together:
 * - `data.ts` is the collection and how it is filled (Equicord's `components/data.tsx`),
 * - `Settings.tsx` shows it (Equicord's `components/ui.tsx`),
 * - `config.ts` is what is saved.
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { DEFAULT_SETTINGS, store } from './config'
import { Data, setCurrent } from './data'
import { diag } from './diag'
import Settings from './Settings'
import type { RememberSettings } from './config'

/** Discord's module that sends messages. */
interface MessageActions {
	sendMessage(
		channelId: string,
		message: { content?: string },
		...rest: unknown[]
	): unknown
	receiveMessage: unknown
}

export default plugin<{ jsonStorage: RememberSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)

		const data = new Data().withStart()
		setCurrent(data)

		data.initializeUsersCollection()
		const writeServers = () => {
			diag.guard('owners of your servers', () =>
				data.writeGuildsOwnersToCollection(),
			)
			diag.guard('members of servers you own', () =>
				data.writeMembersFromUserGuildsToCollection(),
			)
		}
		writeServers()
		// On a phone the plugin can start before Discord has your servers: they are gone through again once it connects.
		cleanup(
			onFluxEventDispatched('CONNECTION_OPEN', payload => {
				setTimeout(writeServers, 3000)
				return payload
			}),
		)

		// Equicord's `addMessagePreSendListener`: who a message replies to and mentions is remembered before it is sent.
		cleanup(
			getModules(
				withProps<MessageActions>('sendMessage', 'receiveMessage'),
				messages => {
					cleanup(
						instead(messages, 'sendMessage', function (args, original) {
							const [channelId, message, , options] = args as [
								string,
								{ content?: string },
								unknown,
								{ messageReference?: never } | undefined,
							]
							try {
								data.onMessagePreSend(channelId, message ?? {}, {
									replyOptions: options ?? {},
								})
							} catch (error) {
								diag.fail('message', error)
							}
							return Reflect.apply(original, this, args)
						}),
					)
					diag.log('patch', 'sendMessage wrapped')
				},
			),
		)

		data.storageAutoSaveProtocol()
		cleanup(() => {
			clearInterval(data._storageAutoSaveProtocol_interval)
			// Saved once more, so the last three minutes are not lost when the plugin stops.
			data.updateStorage()
			setCurrent(undefined)
			store.clear()
		})
		diag.log('plugin', 'started')
	},
})
