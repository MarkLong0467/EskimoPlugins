/**
 * Bypass Status.
 *
 * Get Discord's normal notification, banner and sound from chosen people (or from everyone) while your status is Do Not
 * Disturb.
 *
 * How it works. The decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354) shows where the block
 * is. `discord_app/stores/native/InAppNotificationStore.tsx` handles every new message and asks
 *
 *     NotificationTextUtils.shouldNotify(message, channelId, includeSelectedChannel, ignoreStatus)
 *
 * (`discord_app/modules/notifications/NotificationTextUtils.tsx`). Inside, `shouldNotifyBase` answers "no" while
 * `SelfPresenceStore.getStatus()` is Do Not Disturb, unless `ignoreStatus` is true. So this plugin wraps `shouldNotify`
 * and, for a message from somebody you chose, calls it with `ignoreStatus = true`. Everything else Discord checks (muted
 * chats, blocked people, your notification settings) still applies, and the banner and sound are Discord's own.
 *
 * Notifications sent to your phone while the app is closed are decided by Discord's servers. This plugin cannot change
 * those.
 *
 * How it is put together:
 * - `notify.ts` wraps `shouldNotify`, `rule.ts` decides who may bypass, `list.ts` is the list,
 * - `banner.ts` is a banner of the plugin's own, used when Discord's function is not found or when you turn it on,
 * - `menu.ts` adds "Bypass Do Not Disturb" to the hold-down menu of a chat, channel or server,
 * - `Settings.tsx` is the settings screen, `report.ts` the report,
 * - `config.ts`, `state.ts`, `discord.ts`, `toast.ts`, `constants.ts` and `types.ts` are small helpers.
 */

import { listenForOwnBanner } from './banner'
import { clearListeners, setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import { hookMenus } from './menu'
import { letChosenMessagesThroughDoNotDisturb } from './notify'
import Settings from './Settings'
import { hooks, INSTANCE, INSTANCE_KEY } from './state'
import type { BypassSettings } from './types'

export default plugin<{ jsonStorage: BypassSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		;(globalThis as unknown as Record<string, unknown>)[INSTANCE_KEY] = INSTANCE
		setStorage(jsonStorage)

		/** Runs one step; if it fails the reason is kept for the settings screen and the other steps still run. */
		const attempt = (what: string, step: () => void) => {
			try {
				step()
			} catch (error) {
				hooks.error = `${what}: ${String((error as { message?: unknown } | undefined)?.message || error).slice(0, 70)}`
			}
		}
		attempt('notification function', () =>
			letChosenMessagesThroughDoNotDisturb(cleanup),
		)
		attempt('own banner', () => listenForOwnBanner(cleanup))
		attempt('menus', () => hookMenus(cleanup))
		cleanup(clearListeners)
	},
})
