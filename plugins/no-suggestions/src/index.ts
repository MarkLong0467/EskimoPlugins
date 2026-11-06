/**
 * No Suggestions.
 *
 * Removes the "Suggested" channel section of a server, which comes back even after it is removed.
 *
 * Ported 1:1 to Valenced from the Revenge plugin by PalmDevs (https://github.com/PalmDevs/revenge-plugins).
 *
 * How it works. Discord draws the section with `SuggestedCategory({ guildId, channelIds, withMarginTop })` from
 * `modules/channel_list_v2/native/items`. This plugin replaces it: with no suggestions it draws nothing, and with some it
 * clears them (the same `BULK_CLEAR_RECENTS` Discord's own "clear" option sends) and draws the section with none.
 *
 * How it finds the section. The original found Discord's module with `findByProps`. Valenced's finders only see modules that
 * Discord has already loaded, so the plugin watches the JSX runtime for the component by its name instead (see `jsxFind.ts`),
 * which needs no module. The module is patched too, if it is found, as a second way.
 */

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { installJsxFinder } from '../../../shared/palmdevs/jsxFind'
import { clearSuggestions, watchForClear } from './clear'
import { diag } from './diag'
import Settings from './Settings'
import { resetState, state } from './state'

/** The props Discord gives the suggested section. */
interface SuggestedProps {
	guildId: string
	channelIds?: string[] | null
	[key: string]: unknown
}

/** Draws the suggested section. */
type SuggestedCategory = (props: SuggestedProps) => unknown

/** Something that has the section as a property. */
interface Datasource {
	SuggestedCategory: SuggestedCategory
}

/** Set while the plugin's own version is drawing, so the other way of finding the section does not do it twice. */
let drawing = false

/**
 * What the section draws: nothing with no suggestions, and with some, it clears them and draws the section with none.
 *
 * Discord's own component is run in both cases, so that its hooks run on every draw (a component that skips them on one draw
 * makes React fail). With no suggestions its result is thrown away.
 */
function suggested(
	props: SuggestedProps,
	original: SuggestedCategory,
): unknown {
	if (drawing) return original(props)
	drawing = true
	try {
		// If it still gets rendered without any suggestions, we can just render an empty section.
		// There is no need to send an unnecessary request to clear the recent channels.
		if (!props?.channelIds?.length) {
			state.empty++
			original(props)
			return null
		}
		state.cleared++
		state.channelsCleared += props.channelIds.length
		clearSuggestions(props.guildId, props.channelIds)
		return original({ ...props, channelIds: [] })
	} finally {
		drawing = false
	}
}

/** The component that stands in for a copy of Discord's section. One for each copy, always the same one. */
const stand = new WeakMap<object, SuggestedCategory>()

function standInFor(original: SuggestedCategory): SuggestedCategory {
	let made = stand.get(original)
	if (!made) {
		made = function SuggestedCategoryWithoutSuggestions(props) {
			return suggested(props, original)
		}
		stand.set(original, made)
	}
	return made
}

export default plugin({
	SettingsComponent: Settings,

	start({ cleanup, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		cleanup(resetState)
		watchForClear(cleanup)

		// The main way: watch for the section being drawn.
		state.jsx = installJsxFinder(cleanup, [
			{
				name: 'SuggestedCategory',
				seen: () => diag.log('found', 'SuggestedCategory was drawn'),
				replace: type => {
					if (typeof type !== 'function') return undefined
					state.replaced++
					return standInFor(type as SuggestedCategory)
				},
			},
		])
		if (!state.jsx) diag.log('jsx', 'The JSX runtime was not found', 'warn')

		// The second way: patch the module that has the section, if Discord has loaded it.
		const patched = new Set<object>()
		cleanup(
			getModules(withProps('SuggestedCategory'), (exports: unknown) => {
				const module = exports as { default?: unknown } | null
				const datasource = [exports, module?.default].find(
					candidate =>
						!!candidate &&
						typeof (candidate as Partial<Datasource>).SuggestedCategory ===
							'function',
				) as Datasource | undefined
				if (!datasource || patched.has(datasource)) return
				patched.add(datasource)

				cleanup(
					diag.apply('SuggestedCategory (module)', () => {
						const unpatch = valenced.patcher.instead(
							datasource,
							'SuggestedCategory',
							((args: [SuggestedProps], original: SuggestedCategory) =>
								suggested(args[0], original)) as never,
						)
						state.patched++
						return unpatch
					}),
				)
			}),
		)
	},
})
