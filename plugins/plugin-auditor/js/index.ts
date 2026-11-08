/**
 * Plugin Auditor.
 *
 * Scans the plugins you have installed for signs of sensitive access, lists every link in their code, finds plugins that
 * are copies of each other and can check them on VirusTotal. A plugin runs with the same access as Discord itself, so this
 * reads the code for what it could do; it never runs it.
 *
 * How it is put together:
 * - `source.ts` gets the installed plugins and their code, `scan.ts` applies the rules in `rules.ts` and the links in
 *   `links.ts`, and `duplicates.ts` compares plugins with each other,
 * - `virustotal.ts` talks to VirusTotal and `hash.ts` makes the SHA-256 it needs,
 * - `store.ts` ties these together and tells the screens when something changed,
 * - `Settings.tsx` is the settings screen (`Hero.tsx`, `PluginsTab.tsx`, `LinksTab.tsx`, `CopiesTab.tsx`, `OptionsTab.tsx`)
 *   and `PluginSheet.tsx`, `HostSheet.tsx` and `VtBlock.tsx` are the sheets,
 * - `config.ts`, `constants.ts`, `discord.ts`, `components.tsx`, `format.ts`, `types.ts` and `diag.ts` are helpers.
 */

import { setStorage, setting } from './config'
import { DEFAULT_SETTINGS } from './constants'
import { diag } from './diag'
import { toast } from './discord'
import Settings from './Settings'
import { auditor } from './store'
import type { AuditorSettings } from './types'

export default plugin<{ jsonStorage: AuditorSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorage(jsonStorage)
		diag.log('plugin', `autoScan ${setting('autoScan') ? 'on' : 'off'}`)

		// The start-up alert: only high and critical plugins that are not whitelisted, named so it is clear which.
		auditor.onAttention = names => {
			if (names.length === 0 || !setting('notify')) return
			const shown = names.slice(0, 2).join(', ')
			const more = names.length > 2 ? ` +${names.length - 2}` : ''
			toast(
				names.length === 1
					? `${shown} needs attention. See Plugin Auditor.`
					: `${shown}${more} need attention. See Plugin Auditor.`,
			)
		}
		cleanup(auditor.scheduleAutoScan())
		cleanup(() => {
			auditor.onAttention = undefined
			auditor.stop()
		})
	},
})
