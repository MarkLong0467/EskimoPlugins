/**
 * Role Options.
 *
 * Adds Copy Role Name, Copy Role Color and Copy Role Icon to the role menu, and copies the color when you hold a role
 * on a profile.
 *
 * The role color on a long press is based on CopyRoleColor for Vendetta by MSMA (public domain),
 * https://github.com/Martinz64/vendetta-plugins. Rewritten for Valenced.
 *
 * How it is put together:
 * - `patches.ts` patches the JSX runtime (to find the role menu) and the role chip (for the long press),
 * - `decorate.ts` adds the options to the menu, `options.ts` is what the options do,
 * - `roles.ts` finds a role by id, `clipboard.ts` copies, `color.ts` works out colors,
 * - `tree.ts`, `state.ts`, `toast.ts` and `constants.ts` are small helpers.
 */

import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { patchJsxRuntime, patchRolePill } from './patches'

export default plugin({
	start({ cleanup }) {
		patchJsxRuntime(cleanup)

		// The role chip on a profile. `returnNamespace` hands over the module itself, whose `default` is the component.
		cleanup(
			getModules(
				withName('ThemedRolePill'),
				module => patchRolePill(module, cleanup),
				{ returnNamespace: true },
			),
		)
	},
})
