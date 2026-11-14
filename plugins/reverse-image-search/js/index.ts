/**
 * Reverse Image Search.
 *
 * Adds ImageSearch to image context menus. A port of ReverseImageSearch for Equicord by Ven and Nuckyz
 * (https://equicord.org/plugins/ReverseImageSearch), with the same engines and addresses.
 *
 * How it is put together:
 * - `menu.ts` adds "Search Image" to the menu of a held picture and to the picture viewer's menu,
 * - `EngineSheet.tsx` is Equicord's submenu of engines, as a sheet,
 * - `engines.ts` is Equicord's list of engines and its `search`.
 */

import { diag } from './diag'
import { sheets } from './discord'
import { ENGINE_SHEET_KEY } from './EngineSheet'
import { installMessageMenu, installViewerMenu } from './menu'
import Settings from './Settings'

export default plugin({
	SettingsComponent: Settings,

	start({ cleanup, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		diag.guard('message menu', () => installMessageMenu(cleanup))
		diag.guard('viewer menu', () => installViewerMenu(cleanup))
		cleanup(() => {
			try {
				sheets().hideActionSheet(ENGINE_SHEET_KEY)
			} catch {
				// Nothing was open.
			}
		})
	},
})
