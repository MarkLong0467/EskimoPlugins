/**
 * Spotify Tools.
 *
 * Listen Along, and sending your song as a listen along invite, a song link or an album link from the + menu.
 *
 * Based on the "Add Listen Along" and "Send Spotify invite" modules of nexpid's NexxUtils for Revenge (CC BY 4.0),
 * https://github.com/nexpid/RevengePlugins. Rewritten for Valenced.
 *
 * How it is put together:
 * - `index.ts` finds the components to patch and Discord's Spotify controls,
 * - `ListenButton.tsx` is the Listen along button, `listen.ts` starts listening and follows the other person's songs,
 *   `web.ts` plays through Spotify's web API when Discord's own controls are not found,
 * - `menu.ts` adds the send options to the + menu, `send.ts` sends the messages,
 * - `activity.ts` reads what is playing, `patchComponent.ts` patches a component of any shape,
 * - `Settings.tsx` is the settings screen, and `config.ts`, `discord.ts`, `constants.ts` and `types.ts` are helpers.
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import { decorateListen } from './ListenButton'
import { noteSpotifyActions, onPresenceUpdates, reset } from './listen'
import { installMenuHook } from './menu'
import { patchComponent } from './patchComponent'
import Settings from './Settings'
import type { SpotifySettings } from './types'

export default plugin<{ jsonStorage: SpotifySettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		// The Listen Along button goes next to Play on Spotify, in either of its two forms.
		for (const name of ['SpotifyPlayButton', 'PlayOnSpotifyButton']) {
			cleanup(
				getModules(withProps(name), module => {
					patchComponent(
						module as Record<string, unknown>,
						name,
						decorateListen,
						cleanup,
					)
				}),
			)
		}

		// Discord's own Spotify controls, and the other person's song changes.
		cleanup(getModules(withProps('play', 'sync'), noteSpotifyActions))
		cleanup(onFluxEventDispatched('PRESENCE_UPDATES', onPresenceUpdates))
		cleanup(reset)

		try {
			installMenuHook(cleanup)
		} catch {
			// The Listen along button still works without the + menu options.
		}
	},
})
