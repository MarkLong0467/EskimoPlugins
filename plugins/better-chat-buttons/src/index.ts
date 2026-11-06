/**
 * Better Chat Buttons.
 *
 * Hides the chat bar buttons that get in the way (Apps & Commands, Gift, New Thread, Voice Message) and chooses whether the
 * send button and the action buttons collapse.
 *
 * Ported 1:1 to Valenced from the Revenge plugin by PalmDevs (https://github.com/PalmDevs/revenge-plugins).
 *
 * How it works. The chat bar parts `ChatInputSendButton`, `ChatInputActions` and `ChatInputRightActions` (in
 * `modules/chat_input/native`) get their buttons from props such as `canSendVoiceMessage` and `shouldShowGiftButton`. This
 * plugin changes those props just before the parts draw, and wraps what they give out through their refs
 * (`setHasText`, `onDismissActions`) to decide whether they collapse.
 */

import { DEFAULT_SETTINGS, store } from './config'
import { diag } from './diag'
import { installPatches } from './patches'
import Settings from './Settings'
import { resetState } from './state'
import type { ButtonSettings } from './config'

export default plugin<{ jsonStorage: ButtonSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		cleanup(() => {
			store.clear()
			resetState()
		})
		installPatches(cleanup)
	},
})
