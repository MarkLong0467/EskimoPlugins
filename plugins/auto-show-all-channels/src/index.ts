/**
 * Auto Show All Channels.
 *
 * Turns on "Show All Channels" by itself in every server you join, so community servers never hide channels from you. There
 * is also a button for the servers you are already in.
 *
 * How it works. In a community server, Discord's server menu has a "Show All Channels" switch (modules/guild_action_sheet,
 * `GuildActionSheetSecondaryActions`). The switch is the opposite of the server's opt-in mode: it calls
 * `OptInOnboardingUtils.toggleShowAllChannels`, which ends in `OptInChannelsActionCreators.setGuildOptIn(guildId, false)`.
 * This plugin calls the same `setGuildOptIn`, for a server when it is joined (`GUILD_JOIN`, `GUILD_CREATE`).
 *
 * Each server is dealt with once. If you turn Show All Channels off in a server later, it is left that way.
 *
 * How it is put together:
 * - `join.ts` watches for joins, `apply.ts` turns the option on (for one server or for all),
 * - `discord.ts` finds Discord's stores and `setGuildOptIn`,
 * - `Settings.tsx` is the settings screen, and `config.ts`, `state.ts` and `diag.ts` are helpers.
 */

import { DEFAULT_SETTINGS, store } from './config'
import { diag } from './diag'
import { optInActions, watchOptIn } from './discord'
import { watchJoins } from './join'
import Settings from './Settings'
import { resetState, state } from './state'
import type { AutoSettings } from './config'

export default plugin<{ jsonStorage: AutoSettings }>({
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
		watchOptIn(cleanup)
		state.actionFound = !!diag.guard('find setGuildOptIn', () => optInActions())
		watchJoins(cleanup)
		diag.log('plugin', 'started')
	},
})
