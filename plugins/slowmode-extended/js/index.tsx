/**
 * Slowmode Extended.
 *
 * Discord's slowmode picker only offers a few values. This plugin replaces its list with a longer one: every second up
 * to a minute, every minute up to an hour, and every hour up to 6 hours (the most Discord accepts).
 *
 * Same idea as SlowmodeExtended for Vendetta by sapphire (https://github.com/aeongdesu/vdplugins). Written from
 * scratch for Valenced.
 *
 * How it is put together:
 * - `index.tsx` finds Discord's constants module and swaps the list,
 * - `values.ts` makes the new list, `replace.ts` puts it in place and can put the old one back,
 * - `status.ts` and `Settings.tsx` show what happened on the settings screen.
 */

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { LIST_PROPERTY } from './constants'
import { replaceValues } from './replace'
import Settings from './Settings'
import { status } from './status'
import { extendedValues } from './values'
import type { ListHolder } from './types'

/** Finds the object that owns the list: the module itself, or its default export. */
function findHolder(module: unknown): ListHolder | null {
	const exported = module as
		| (ListHolder & { default?: ListHolder })
		| null
		| undefined
	if (exported && exported[LIST_PROPERTY] !== undefined) return exported
	if (exported?.default && exported.default[LIST_PROPERTY] !== undefined)
		return exported.default
	return null
}

export default plugin({
	SettingsComponent: Settings,

	start({ cleanup }) {
		// The list lives in a module of Discord's constants, which may load after this plugin starts. getModules also
		// reports modules that load later. `returnNamespace` hands over the module itself, not only its default export.
		cleanup(
			getModules(
				withProps(LIST_PROPERTY),
				module => {
					const holder = findHolder(module)
					if (!holder) {
						status.found = 'a module matched, but it has no list'
						return
					}

					const list = holder[LIST_PROPERTY]
					status.found = `found (${Array.isArray(list) ? `${list.length} choices` : 'in Discord'})`

					try {
						const values = extendedValues()
						cleanup(replaceValues(holder, values))
						status.applied = true
						status.count = values.length
					} catch (error) {
						status.error = String(
							(error as Error | undefined)?.message ?? error,
						).slice(0, 80)
					}
				},
				{ returnNamespace: true },
			),
		)
	},
})
