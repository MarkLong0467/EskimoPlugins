/**
 * Always Trust.
 *
 * Removes the untrusted link confirmation when opening external links.
 *
 * Ported 1:1 to Valenced from the Revenge Next plugin by kmmiio99o (https://git.gay/kmmiio99o/revenge-next-plugins).
 */

import { diag } from './diag'
import Settings from './Settings'

export default plugin({
	start({ cleanup, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		cleanup(
			valenced.discord.flux.getStore('MaskedLinkStore', (store: any) => {
				cleanup(
					diag.apply('MaskedLinkStore.isTrustedDomain', () =>
						valenced.patcher.after(store, 'isTrustedDomain', () => true),
					),
				)
			}),
		)
	},
	SettingsComponent: Settings,
})
