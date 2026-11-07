/**
 * Better Command Popout.
 *
 * Adds "Copy Command Mention" and "Copy Command ID" to the popout that opens when you tap a slash command in a message.
 *
 * Ported 1:1 to Valenced from the Vendetta plugin by aliernfrog (https://github.com/aliernfrog/vd-plugins).
 */

import { diag } from './diag'
import { installPopoutPatch, resetNotes } from './popout'
import Settings from './Settings'
import { resetState } from './state'

export default plugin({
	SettingsComponent: Settings,

	start({ cleanup, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		cleanup(resetState)
		cleanup(resetNotes)
		cleanup(installPopoutPatch())
	},
})
