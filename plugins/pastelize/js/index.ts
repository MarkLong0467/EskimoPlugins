/**
 * Pastelize.
 *
 * Gives every name in chat its own pastel colour, worked out from the person's ID, so people who have no role colour (and
 * everyone in DMs) are easy to tell apart. Names that already have a role colour keep it, unless the user asks for everyone.
 *
 * After Pastelize for Vendetta by Cynosphere (https://github.com/Cynosphere). Written anew for Valenced; the colours are the
 * same ones, because they come from the same hash of the ID.
 *
 * How it is put together:
 * - `rows.ts` changes the colours in the data Discord makes for each message,
 * - `color.ts` works a colour out from an ID, `config.ts` is what is saved.
 */

import { DEFAULT_SETTINGS, store } from './config'
import { diag } from './diag'
import { installRows } from './rows'
import Settings from './Settings'
import { resetState } from './state'
import type { PastelSettings } from './config'

export default plugin<{ jsonStorage: PastelSettings }>({
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
		installRows(cleanup)
		diag.log('plugin', 'started')
	},
})
