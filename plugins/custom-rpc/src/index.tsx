import { DEFAULTS } from './constants'
import { diag } from './diag'
import { applyActivity, clearActivity } from './lib/activity'
import { setImagePickerOverride } from './lib/imagePicker'
import { initKmmiioLib } from './lib/modules'
import { getSettings, pluginState, setStorage } from './lib/state'
import { maybePromptActivityBlocked } from './ui/components/ActivityVisibilityNotice'
import { registerImagePages } from './ui/routes'
import Settings from './ui/Settings'
import type { CustomRpcStorage } from './types'
export default plugin<{ jsonStorage: CustomRpcStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorage(jsonStorage)

		cleanup(diag.apply('image pages', registerImagePages))

		const kmmiio = (plugin.api as any)?.unscoped?.kmmiio

		if (kmmiio?.registerPlugin && kmmiio?.setActivePlugin) {
			kmmiio.registerPlugin?.({
				id: plugin.manifest.id,
				name: plugin.manifest.name,
				icon: plugin.manifest.icon,
				author: (plugin.manifest as any).author,
				description: (plugin.manifest as any).description,
				version: plugin.manifest.version,
				getStatus: () => (plugin.errors.length > 0 ? 'Errored' : 'Running'),
				getErrors: () => plugin.errors,
			})
			kmmiio.setActivePlugin?.(plugin.manifest.id)
			initKmmiioLib(kmmiio)
			setImagePickerOverride(kmmiio.getImagePicker)
		}

		// Stop showing a stale activity when the plugin is disabled.
		if (!getSettings().enabled) {
			clearActivity()
		} else {
			applyActivity()
		}

		// Surface a filtered activity without requiring the settings page to be
		// opened, since Discord reports success either way.
		maybePromptActivityBlocked()

		jsonStorage.subscribe(() => {
			if (!getSettings().enabled) {
				clearActivity()
			} else {
				applyActivity()
			}
		})

		cleanup(() => {
			// Clear first: `sendRequest` refuses to dispatch once the plugin is
			// marked stopped, so raising the flag before this would leave the
			// activity stuck on the profile.
			clearActivity()
			pluginState.pluginStopped = true
		})
	},
	SettingsComponent: Settings,
})
