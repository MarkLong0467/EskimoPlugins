/**
 * Raw Viewer.
 *
 * Shows RAW photos (Nikon, Canon, Sony, Fujifilm, Olympus, Panasonic, Pentax, DNG and more) as photos in chat, and adds an
 * info button and a swipe-up handle to every picture in Discord's viewer, which open its metadata: date, place with a map
 * that opens Google Maps, camera, lens and settings.
 *
 * RAW files hold a full-size JPEG preview. The plugin uses that preview and never decodes the RAW data, which would be far
 * too slow on a phone.
 *
 * How it is put together:
 * - `index.ts` starts everything; `patch.ts`, `queue.ts` and `convert.ts` turn RAW attachments into photos, downloading
 *   only the preview with HTTP Range requests (`http.ts`, `reader.ts`) found by `preview.ts` in the TIFF structure
 *   (`tiff.ts`) or the JPEGs (`jpeg.ts`) of the file,
 * - `viewer.tsx` adds the button and handle to Discord's viewer and `MetadataSheet.tsx` is the sheet they open; `picture.ts`
 *   finds the file to read, `exif.ts` reads the metadata and `format.ts` writes it as text,
 * - `Settings.tsx` is the settings screen; `config.ts`, `constants.ts`, `types.ts` and `discord.ts` are helpers.
 */

import { onFluxEventDispatched } from '@valenced/discord/flux'
import { setStorage } from './config'
import {
	DEFAULT_SETTINGS,
	MESSAGE_LIST_EVENTS,
	SHEET_KEY,
	SINGLE_MESSAGE_EVENTS,
	TAG,
} from './constants'
import { loadIndex } from './convert'
import { sheets } from './discord'
import { installMenuHook } from './menu'
import { patchMessage } from './patch'
import { clearPictures } from './picture'
import { startQueue } from './queue'
import Settings from './Settings'
import { installMenuItem, installViewer } from './viewer'
import type { DiscordMessage, RawViewerSettings } from './types'

export default plugin<{ jsonStorage: RawViewerSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)
		cleanup(() => {
			try {
				sheets().hideActionSheet(SHEET_KEY)
			} catch {
				// Nothing was open.
			}
			clearPictures()
		})

		try {
			installViewer(cleanup)
		} catch (error) {
			console.warn(`${TAG} viewer patch failed:`, String(error))
		}

		try {
			installMenuItem(cleanup)
		} catch (error) {
			console.warn(`${TAG} viewer menu patch failed:`, String(error))
		}

		try {
			installMenuHook(cleanup)
		} catch (error) {
			console.warn(`${TAG} menu patch failed:`, String(error))
		}

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
