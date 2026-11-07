/**
 * Flame Text.
 *
 * Turns the text you send into a burning, animated GIF. It is drawn on the phone (`render/`), sent as a file the way Discord's own
 * share code sends one (`send.ts`), and switched on and off with a flame button in the chat box (`button.tsx`) or `/flame`
 * (`command.ts`). Settings are in `store.ts` and the screen is `Settings.tsx`.
 */

import { installButton } from './button'
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
		cleanup(() => store.clear())
		cleanup(resetState)
		installFinders(cleanup)
		installSend(cleanup)
		installCommand(cleanup, info => {
			if (info.text?.trim()) sendOnce(info.channelId, info.text)
			else switchFlame()
		})
		installButton(cleanup)
	},
})
