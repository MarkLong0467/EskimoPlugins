/**
 * Server Info.
 *
 * Hold down a server icon and tap Server Info to see its members, roles, channels, boosts, owner, friends in it and more.
 *
 * Based on the Server Info plugin for Revenge by fshin, published in https://github.com/kmmiio99o/revenge-plugins under
 * CC0 (public domain). Rewritten for Valenced.
 *
 * How it is put together:
 * - `index.ts` patches the code that builds the server menu, to add the item,
 * - `menu.tsx` is the item and what it opens, `ServerInfoSheet.tsx` and `FriendsSheet.tsx` are the sheets,
 * - `friends.ts` finds your friends in a server, `format.ts` makes dates, numbers and links,
 * - `discord.ts` is the small layer over Discord's stores and actions, `state.ts` remembers owners.
 */

import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { FRIENDS_KEY, SHEET_KEY } from './constants'
import { sheets } from './discord'
import { withServerInfo } from './menu'
import { ownerCache } from './state'

export default plugin({
	start({ cleanup }) {
		// When the plugin stops, close its sheets and forget the owners.
		cleanup(() => {
			for (const key of [SHEET_KEY, FRIENDS_KEY]) {
				try {
					sheets().hideActionSheet(key)
				} catch {
					// Nothing was open.
				}
			}
			ownerCache.clear()
		})

		// The code that builds the menu of a server icon. Found with getModules so it is also picked up if Discord loads it later.
		cleanup(
			getModules(
				withName('getGuildsBarGuildMenuItems'),
				module => {
					const target = module as { default?: unknown } | null | undefined
					if (!target || typeof target.default !== 'function') return
					cleanup(
						instead(
							target as { default: (...args: unknown[]) => unknown },
							'default',
							function (args, original) {
								const items = Reflect.apply(original, this, args)
								try {
									return withServerInfo(items, args[0])
								} catch {
									return items
								}
							},
						),
					)
				},
				{ returnNamespace: true },
			),
		)
	},
})
