/**
 * Message Reminders.
 *
 * Hold a message, tap Remind Me and pick a time. When it comes, a sheet shows the message with Jump, Snooze and Done.
 * A reminder that came due while Discord was closed is shown the next time it opens.
 *
 * How it is put together:
 * - `menu.tsx` adds the item to the message menu and notes which message the menu is for,
 * - `PickSheet.tsx` picks the time, `DueSheet.tsx` shows reminders that are due, `ItemSheet.tsx` shows one from the settings,
 * - `reminders.ts` keeps the list, `scheduler.ts` looks for reminders that are due, `time.ts` makes the times,
 * - `Settings.tsx` is the settings screen, and `config.ts`, `discord.ts`, `constants.ts`, `components.tsx`, `types.ts` and
 *   `diag.ts` are helpers.
 */

import { setStorage, setting } from './config'
import { DEFAULT_SETTINGS } from './constants'
import { openDueSheet } from './DueSheet'
import { diag } from './diag'
import { toast } from './discord'
import { forgetTarget, installMenuHook } from './menu'
import { all, forget, reload } from './reminders'
import Settings from './Settings'
import { forgetAnnounced, startScheduler } from './scheduler'
import type { ReminderSettings } from './types'

export default plugin<{ jsonStorage: ReminderSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorage(jsonStorage)
		reload()
		diag.log('plugin', `${all().length} reminder(s) loaded`)

		cleanup(diag.apply('message menu', () => installMenuHook(cleanup)))

		startScheduler(cleanup, fresh => {
			const first = fresh[0]
			const text =
				fresh.length === 1
					? `Reminder: ${first?.preview || first?.author || 'a message'}`
					: `${fresh.length} reminders are due`
			diag.log('due', `${fresh.length} due`)
			toast(text)
			if (setting('sheet')) openDueSheet()
		})

		// When the plugin stops, the list held in memory and what was announced are forgotten. The saved list stays.
		cleanup(() => {
			forgetTarget()
			forgetAnnounced()
			forget()
		})
	},
})
