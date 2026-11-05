/**
 * Status Presets.
 *
 * Save a status as a preset (Online / Idle / Do Not Disturb / Invisible, plus a custom status with an emoji and a
 * "clear after" time) and switch to it with one tap.
 *
 * How it works. The decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354) stores your status as
 * four "proto settings" in `discord_app/modules/user_settings/UserSettings.tsx`:
 *
 *     StatusSetting            "online" | "idle" | "dnd" | "invisible"
 *     StatusExpiresAtSetting   milliseconds as text, "0" = never
 *     StatusCreatedAtSetting   milliseconds as text
 *     CustomStatusSetting      { text, emojiId, emojiName, expiresAtMs, createdAtMs } or undefined
 *
 * The presets are shown in the plugin settings, under the status picker of your account sheet (You tab, tap your avatar)
 * and on the "Set your status" screen (`modules/custom_status/native/EditCustomStatusWithPreview.tsx`).
 *
 * Discord's own screens call `.updateSetting(value)` on these (see `modules/custom_status/setCustomStatus.tsx` and
 * `modules/multi_account/setUserStatus.tsx`). This plugin calls the very same functions, so the result is saved and
 * synced exactly like a status picked by hand.
 *
 * How it is put together:
 * - `status.ts` finds and reads the four settings and writes to them, `apply.ts` applies and undoes a preset,
 * - `presets.ts` cleans, reads and writes the saved presets and makes their labels,
 * - `hook.tsx` adds the presets to the account sheet and the "Set your status" screen (`SheetPresets.tsx`),
 * - `Settings.tsx` is the settings screen (`NowCard.tsx`, `PresetList.tsx`, `EditPreset.tsx`, `components.tsx`),
 * - `report.ts` is the report and self-check, `config.ts`, `state.ts`, `constants.ts` and `types.ts` are helpers.
 */

import { clearListeners, setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import { hookStatusSheet } from './hook'
import Settings from './Settings'
import { addLog, INSTANCE, INSTANCE_KEY } from './state'
import { forgetSettings, settingsModules } from './status'
import type { PresetSettings } from './types'

export default plugin<{ jsonStorage: PresetSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)
		const registry = globalThis as unknown as Record<string, unknown>
		registry[INSTANCE_KEY] = INSTANCE

		try {
			settingsModules()
		} catch {
			// They are looked for again when a preset is applied.
		}
		try {
			hookStatusSheet(cleanup)
		} catch (error) {
			addLog(
				`sheet hook: ${(error as { message?: unknown } | undefined)?.message}`,
				false,
			)
		}

		cleanup(() => {
			clearListeners()
			forgetSettings()
			if (registry[INSTANCE_KEY] === INSTANCE)
				registry[INSTANCE_KEY] = undefined
		})
	},
})
