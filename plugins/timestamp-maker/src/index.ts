/**
 * Timestamp Maker.
 *
 * Adds `/timestamp` to Discord's built-in commands. It opens a popup to build a Discord timestamp: pick the date and time, pick
 * one of the seven styles, add text, then send it, add it to the message you are writing, or copy it. Typing `@time` in a
 * message you send turns it into a timestamp too (it can be switched off in the settings).
 *
 * Parts: `command.ts` adds the command, `Popup.tsx` is the popup, `time.ts` is all the time maths and reading, `deliver.ts`
 * sends, inserts and copies, `atTime.ts` is `@time`, `run.ts` joins the command to the popup and finds the chat box.
 */

import { installAtTime } from './atTime'
import { installCommand } from './command'
import { forgetChatBox } from './deliver'
import { diag } from './diag'
import { installChatBox, runCommand } from './run'
import Settings from './Settings'
import { resetState } from './state'
import { DEFAULT_SETTINGS, store } from './store'
import type { Settings as TimestampSettings } from './store'

export default plugin<{ jsonStorage: TimestampSettings }>({
	SettingsComponent: Settings,
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		cleanup(() => store.clear())
		cleanup(resetState)
		cleanup(forgetChatBox)
		installCommand(cleanup, runCommand)
		installAtTime(cleanup)
		installChatBox(cleanup)
	},
})
