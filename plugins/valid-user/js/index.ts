/**
 * Valid User.
 *
 * Discord draws `<@id>` as @unknown-user when it has never seen that user, and only fetches the user when you tap
 * the mention. This plugin fetches such users in the background and draws the message again, so the mention
 * resolves on its own. It covers message text, embeds (title, description, fields, author, footer) and forwarded
 * messages.
 *
 * How it is put together:
 * - `index.ts` listens to Flux events that carry messages and finds Discord's user actions,
 * - `scan.ts` finds mentions of unknown users in a message (`texts.ts` lists the strings to search),
 * - `lookup.ts` is the queue that fetches those users one at a time and redraws the messages,
 * - `discord.ts` is the small typed layer over Discord's stores and dispatcher.
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { MESSAGE_LIST_EVENTS, SINGLE_MESSAGE_EVENTS, TAG } from './constants'
import { setUserActions, startLookups } from './lookup'
import { scanMessage } from './scan'
import type { DiscordMessage, UserActions } from './types'

export default plugin({
	start({ cleanup }) {
		cleanup(startLookups())

		// Found with getModules so it is also picked up if Discord loads it later.
		cleanup(
			getModules(
				withProps<UserActions>('getUser', 'fetchCurrentUser'),
				setUserActions,
			),
		)

		for (const type of SINGLE_MESSAGE_EVENTS) {
			cleanup(
				onFluxEventDispatched<{ message?: DiscordMessage }>(type, payload => {
					try {
						scanMessage(payload.message)
					} catch (error) {
						console.warn(`${TAG} ${type} scan failed:`, String(error))
					}
					return payload
				}),
			)
		}

		for (const type of MESSAGE_LIST_EVENTS) {
			cleanup(
				onFluxEventDispatched<{
					messages?: DiscordMessage[]
					channelId?: string
				}>(type, payload => {
					try {
						if (Array.isArray(payload.messages)) {
							for (const message of payload.messages)
								scanMessage(message, payload.channelId)
						}
					} catch (error) {
						console.warn(`${TAG} ${type} scan failed:`, String(error))
					}
					return payload
				}),
			)
		}
	},
})
