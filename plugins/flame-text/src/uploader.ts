/**
 * Finds Discord's upload object (`CloudUpload`) even when Discord has not loaded it yet.
 *
 * Discord loads that module the first time a file is uploaded, not when the app starts, so a search by its exports finds
 * nothing until then. What is known without loading it is who it imports: its list of dependencies. Some of those (the logger,
 * durations, analytics, the network store and so on) are loaded all the time, and their numbers can be looked up by their path.
 * The module that depends on all of them is found by that list and loaded, and then checked for a `CloudUpload` in it.
 */

import { lookupModuleWithImportedPath } from '@valenced/discord/utils/modules/finders'
import { lookupModules } from '@valenced/modules/finders'
import { withDependencies } from '@valenced/modules/finders/filters'
import { state } from './state'

/** Paths of modules that `CloudUpload.tsx` imports and that Discord has always loaded by the time a chat is open. */
const IMPORTED = [
	'modules/debug/Logger.tsx',
	'utils/Durations.tsx',
	'utils/AnalyticsUtils.tsx',
	'lib/uploader_inline/InlineUploader.tsx',
	'modules/media_uploads/UploadPlatform.tsx',
	'modules/devtools/dev_settings/DevSettingsStore.tsx',
	'modules/user_settings/UnsyncedUserSettingsStore.tsx',
	'stores/NetworkStore.tsx',
]

/** The most modules to look at. The list of dependencies should leave very few. */
const MOST = 12

/** Discord's upload object, made with `new`. */
export type UploadClass = new (
	item: Record<string, unknown>,
	channelId: string,
) => unknown

/** What a module's exports hold, as far as this file looks. */
interface Exports {
	CloudUpload?: unknown
	default?: { CloudUpload?: unknown }
}

/**
 * Looks for the module by who it imports, loading what matches, until one has a `CloudUpload`.
 *
 * @returns The upload object, or nothing. What happened is written to `state.uploadSearch` for the report.
 */
export function loadUploadClass(): UploadClass | undefined {
	try {
		const ids: number[] = []
		for (const path of IMPORTED) {
			const found = lookupModuleWithImportedPath(path) as unknown as [
				unknown,
				unknown,
			]
			if (typeof found?.[1] === 'number') ids.push(found[1])
		}
		if (ids.length < 3) {
			state.uploadSearch = `only ${ids.length} of ${IMPORTED.length} modules it imports could be found, so it could not be searched for`
			return undefined
		}
		const { atLeast, unordered } = withDependencies
		let looked = 0
		// First by every import that could be found, then by only a few, in case one of them is not really imported.
		for (const wanted of [ids, ids.slice(0, 4)]) {
			const filter = withDependencies(
				atLeast(wanted.length > 4 ? 8 : 4, unordered([...wanted])),
			)
			let tried = 0
			for (const result of lookupModules(filter) as Iterable<unknown[]>) {
				looked++
				tried++
				const exports = result[0] as Exports | undefined
				const found = exports?.CloudUpload ?? exports?.default?.CloudUpload
				if (typeof found === 'function') {
					state.uploadSearch = `loaded on demand (${wanted.length} known imports, ${looked} module(s) looked at)`
					return found as UploadClass
				}
				if (tried >= MOST) break
			}
		}
		state.uploadSearch = `not found (${ids.length} known imports, ${looked} module(s) looked at)`
	} catch (error) {
		state.uploadSearch = `search failed: ${error instanceof Error ? error.message : String(error)}`
	}
	return undefined
}
