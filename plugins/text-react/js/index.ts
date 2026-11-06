/**
 * Text React.
 *
 * Hold a message, tap Text React, type some text, and it is added to the message as reactions: letters become regional
 * indicator emoji, digits become keycaps, and some words (`ok`, `cool`, `100`...) have an emoji of their own.
 *
 * Ported from TextReact for Aliucord by ArjixWasTaken (https://github.com/ArjixWasTaken/aliucord-plugins), which is based
 * on text-react by Juby210 (https://github.com/Juby210/text-react). Written again for Valenced.
 *
 * How it is put together:
 * - `emoji.ts` turns a text into emoji (`emoji-table.ts` has the tables),
 * - `menu.tsx` adds the item to the message menu and notes which message the menu is for,
 * - `TextReactSheet.tsx` asks for the text, `reactions.ts` adds the reactions one at a time,
 * - `Settings.tsx` is the settings screen, and `config.ts`, `discord.ts`, `constants.ts` and `types.ts` are helpers.
 */

import { setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import { forgetTarget, installMenuHook } from './menu'
import { cancelReactions } from './reactions'
import Settings from './Settings'
import type { TextReactSettings } from './types'

export default plugin<{ jsonStorage: TextReactSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)
		installMenuHook(cleanup)
		// When the plugin stops, reactions that are still being added are stopped.
		cleanup(() => {
			cancelReactions()
			forgetTarget()
		})
	},
})
