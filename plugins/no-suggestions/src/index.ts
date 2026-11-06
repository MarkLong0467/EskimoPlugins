/**
 * No Suggestions.
 *
 * Removes the "Suggested" channel section of a server, which comes back even after it is removed.
 *
 * Ported 1:1 to Valenced from the Revenge plugin by PalmDevs (https://github.com/PalmDevs/revenge-plugins).
 *
 * How it works. Discord draws the section with `SuggestedCategory({ guildId, channelIds, withMarginTop })` from
 * `modules/channel_list_v2/native/items`. This plugin replaces it: with no suggestions it draws nothing, and with some it
 * asks Discord to clear them (`clearRecentChannels`) and draws the section with none.
 */

import { getModules, lookupModule } from '@valenced/modules/finders'
import { propsFilter } from '../../../shared/palmdevs/finders'
import { diag } from './diag'
import Settings from './Settings'
import { resetState, state } from './state'

/** The props Discord gives the suggested section. */
interface SuggestedProps {
	guildId: string
	channelIds?: string[] | null
	[key: string]: unknown
}

/** Something that has the section as a property. */
interface Datasource {
	SuggestedCategory: (props: SuggestedProps) => unknown
}

/** Asks Discord to clear the recent channels of a server. */
function clearRecentChannels(guildId: string, channelIds: string[]): void {
	const found = lookupModule(propsFilter('clearRecentChannels'))[0] as
		| { clearRecentChannels?: (guildId: string, channelIds: string[]) => void }
		| undefined
	found?.clearRecentChannels?.(guildId, channelIds)
}

export default plugin({
	SettingsComponent: Settings,

	start({ cleanup, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		cleanup(resetState)

		// More than one module has the section (the file that defines it and the one that re-exports it), and Discord reads it
		// from one of them, so every copy is patched.
		const patched = new Set<object>()
		cleanup(
			getModules(propsFilter('SuggestedCategory'), (exports: unknown) => {
				const found = exports as { default?: unknown } | null
				const datasource = [exports, found?.default].find(
					candidate =>
						!!candidate &&
						typeof (candidate as Partial<Datasource>).SuggestedCategory ===
							'function',
				) as Datasource | undefined
				if (!datasource || patched.has(datasource)) return
				patched.add(datasource)

				cleanup(
					diag.apply('SuggestedCategory', () => {
						const unpatch = valenced.patcher.instead(
							datasource,
							'SuggestedCategory',
							(
								args: [SuggestedProps],
								original: Datasource['SuggestedCategory'],
							) => {
								const props = args[0]
								// If it still gets rendered without any suggestions, we can just render an empty section.
								// There is no need to send an unnecessary request to clear the recent channels.
								if (!props?.channelIds?.length) {
									state.empty++
									return null
								}
								state.cleared++
								state.channelsCleared += props.channelIds.length
								diag.guard('clear', () =>
									clearRecentChannels(
										props.guildId,
										props.channelIds as string[],
									),
								)
								return original({ ...props, channelIds: [] })
							},
						)
						state.patched++
						return unpatch
					}),
				)
			}),
		)
	},
})
