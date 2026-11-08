/**
 * Flame Text.
 *
 * Turns the text you send into a burning, animated GIF. It is drawn on the phone (`render/`), sent as a file the way Discord's own
 * share code sends one (`send.ts`), and switched on and off with a flame button in the chat box (`button.tsx`) or `/flame`
 * (`command.ts`). Settings are in `store.ts` and the screen is `Settings.tsx`.
 */

import { installButton } from './button'
import { installChatButton } from './chatbutton'
import { installCommand } from './command'
import { diag } from './diag'
import Settings from './Settings'
import { installFinders, installSend, sendOnce } from './send'
import { resetState } from './state'
import { DEFAULT_SETTINGS, store } from './store'
import { switchFlame } from './toggle'
import type { Settings as FlameSettings } from './store'

export default plugin<{ jsonStorage: FlameSettings }>({
	SettingsComponent: Settings,
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		// Settings saved before the small, see-through defaults existed are moved to them, once.
		if (!jsonStorage.cache?.defaultsSeen)
			store.set({
				defaultsSeen: true,
				size: 'small',
				background: 'transparent',
			})
		// /flame is off unless you turn it on; settings from before that are moved to off, once.
		if (!jsonStorage.cache?.commandOffSeen)
			store.set({ commandOffSeen: true, command: false })
		cleanup(() => store.clear())
		cleanup(resetState)
		installFinders(cleanup)
		installSend(cleanup)
		installCommand(cleanup, info => {
			if (info.text?.trim()) sendOnce(info.channelId, info.text)
			else switchFlame()
		})
		installButton(cleanup)
		installChatButton(cleanup)
	},
})
