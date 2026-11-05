/**
 * Crop Plus.
 *
 * Discord's picture cropper (Edit image, then Scale and Crop) stops you from cropping small: the frame has a minimum
 * size and the picture can only be zoomed so far. This plugin lets you crop again and again on the result, so every
 * pass can go as small as the cropper allows and the passes add up. It can also set the cropper's options (grid,
 * frame, rotation, starting shape) and shrink the result.
 *
 * How it works. The decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354) opens the cropper in
 * `discord_app/modules/media_uploads/native/UploadPreviewActionSheet.tsx` with
 *
 *     ImagePicker.launchCropper({ uri, freeStyleCropEnabled: true, width, height })
 *
 * and `discord_app/modules/image/native/ImagePicker.tsx` turns that into the options of the native cropper (the
 * react-native-image-crop-picker library, which uses uCrop on Android):
 *
 *     openPickerDefault.openCropper({ path, width, height, freeStyleCropEnabled, cropper...Color, ... })
 *
 * That native screen has a fixed smallest frame and a fixed biggest zoom, and the library has no option for them. This
 * plugin wraps `openCropper`: it changes the options on the way in, and when the cropper returns a picture it can open
 * the cropper again on that new picture. The picture that finally goes back to Discord is the last pass, in the same
 * shape Discord expects (`path`, `width`, `height`, `mime`, `size`, `cropRect`).
 *
 * How it is put together:
 * - `hook.ts` wraps `openCropper`, `crop.ts` is the loop of passes, `options.ts` changes the cropper's options,
 * - `ask.tsx` is the "crop again" sheet,
 * - `Settings.tsx` and `components.tsx` are the settings screen, `report.ts` the self-check and report,
 * - `config.ts`, `state.ts`, `format.ts`, `constants.ts` and `types.ts` are small helpers.
 */

import { clearListeners, setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import { hookCropper, INSTANCE, INSTANCE_KEY } from './hook'
import Settings from './Settings'
import { problem, run } from './state'
import type { CropSettings } from './types'

export default plugin<{ jsonStorage: CropSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)
		const registry = globalThis as unknown as Record<string, unknown>
		registry[INSTANCE_KEY] = INSTANCE

		try {
			hookCropper(cleanup)
		} catch (error) {
			problem('start', error)
		}

		cleanup(() => {
			clearListeners()
			// A sheet that is still open is answered, so the crop that waits for it can finish.
			if (run.answerWith) {
				try {
					run.answerWith('done')
				} catch {
					// The crop is already over.
				}
			}
			if (registry[INSTANCE_KEY] === INSTANCE)
				registry[INSTANCE_KEY] = undefined
		})
	},
})
