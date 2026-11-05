/**
 * NEF Viewer.
 *
 * Shows Nikon RAW attachments (`.nef`, `.nrw`) as photos in chat, instead of as a file to download.
 *
 * Nikon cameras store a full-size JPEG preview inside every NEF file. The plugin uses that preview and never decodes
 * the RAW data, which would be far too slow on a phone.
 *
 * Flow:
 * 1. Flux event handlers (below) spot `.nef` / `.nrw` attachments in incoming messages (`patch.ts`).
 * 2. The conversion queue (`queue.ts`) downloads only the embedded JPEG, with HTTP Range requests (`http.ts`,
 *    `nef.ts`), and caches it on disk (`convert.ts`).
 * 3. The message is sent through Discord again. This time `patch.ts` swaps the attachment for the cached JPEG, so
 *    Discord draws an image.
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { MESSAGE_LIST_EVENTS, SINGLE_MESSAGE_EVENTS, TAG } from './constants'
import { loadIndex } from './convert'
import { patchMessage } from './patch'
import { startQueue } from './queue'
import type { DiscordMessage } from './types'

export default plugin({
	start({ cleanup }) {
		cleanup(startQueue())

		// Previews converted in earlier sessions are still on disk. Loading the index makes them available at once.
		loadIndex().catch(() => {})

		for (const type of SINGLE_MESSAGE_EVENTS) {
			cleanup(
				onFluxEventDispatched<{ message?: DiscordMessage }>(type, payload => {
					try {
						patchMessage(payload.message)
					} catch (error) {
						console.warn(`${TAG} ${type} patch failed:`, String(error))
					}
					return payload
				}),
			)
		}

		for (const type of MESSAGE_LIST_EVENTS) {
			cleanup(
				onFluxEventDispatched<{
					messages?: DiscordMessage[]
					channelId?: string
				}>(type, payload => {
					try {
						if (Array.isArray(payload.messages)) {
							for (const message of payload.messages)
								patchMessage(message, payload.channelId)
						}
					} catch (error) {
						console.warn(`${TAG} ${type} patch failed:`, String(error))
					}
					return payload
				}),
			)
		}
	},

	stop({ plugin }) {
		// Messages that were already drawn keep the swapped attachment, so Discord has to reload to forget it.
		plugin.requireReload()
	},
})
