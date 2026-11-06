/**
 * Quiet Hours.
 *
 * Switches your status to Do Not Disturb (or Idle, or Invisible) on a schedule, such as weeknights from 11 PM to 7 AM, and
 * puts your old status back afterwards. One tap skips tonight.
 *
 * How it works. The decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354) stores your status as
 * four "proto settings" in `discord_app/modules/user_settings/UserSettings.tsx`. This plugin writes them with the same
 * `updateSetting` calls Discord's own screens use, and sets the status's end time to the end of the window, so Discord
 * itself ends it on time even if the app is closed by then.
 *
 * How it is put together:
 * - `schedule.ts` works out the windows from the days and times (pure, no Discord),
 * - `engine.ts` looks at the clock, begins and ends quiet hours and skips a night,
 * - `status.ts` reads and writes Discord's status settings,
 * - `Settings.tsx` is the settings screen with `TimeSheet.tsx` to pick a time,
 * - `config.ts`, `constants.ts`, `discord.ts`, `types.ts` and `diag.ts` are helpers.
 */

import { clearListeners, setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import { diag } from './diag'
import { reloadApplied, startEngine } from './engine'
import Settings from './Settings'
import { forgetSettings, settingsModules } from './status'
import type { QuietSettings } from './types'

export default plugin<{ jsonStorage: QuietSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorage(jsonStorage)
		reloadApplied()
		diag.guard('status settings', () => settingsModules())
		startEngine(cleanup)
		diag.log('plugin', 'started')

		cleanup(() => {
			clearListeners()
			forgetSettings()
		})
	},
})
