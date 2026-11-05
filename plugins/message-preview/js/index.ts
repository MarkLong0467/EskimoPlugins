/**
 * Message Preview.
 *
 * Adds a way to preview your message before sending it: a floating button over the message box, or hold the send
 * button. The preview is shown in a popup, or as a message in the chat that only you can see.
 *
 * Based on the Message Preview plugin for Revenge by nexpid and pylix (CC BY 4.0),
 * https://github.com/nexpid/RevengePlugins. Rewritten for Valenced.
 *
 * How it is put together:
 * - `patches.ts` hooks the message box (for the button) and the send button (for the long press),
 * - `decorate.tsx` adds the button to the box, `PreviewButton.tsx` is the button,
 * - `preview.tsx` builds and shows the preview, `PreviewAlert.tsx` is the popup, `attachments.ts` lists picked files,
 * - `Settings.tsx` is the settings screen, `config.ts` reads the settings, `discord.ts` finds Discord's code.
 */

import { AlertActionCreators } from '@valenced/discord/actions'
import { setStorage } from './config'
import { ALERT_KEY, DEFAULT_SETTINGS } from './constants'
import { patchMessageBox, patchSendButton } from './patches'
import Settings from './Settings'
import type { PreviewSettings } from './types'

export default plugin<{ jsonStorage: PreviewSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		// Close the popup if it is open when the plugin stops.
		cleanup(() => {
			try {
				AlertActionCreators.dismissAlert(ALERT_KEY)
			} catch {
				// Nothing to close.
			}
		})

		patchMessageBox(cleanup)
		patchSendButton(cleanup)
	},
})
