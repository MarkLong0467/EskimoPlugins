import type { KmmiioLib } from '../plugins/kmmiio-lib/js/lib/api'
import type { ToastApi } from '../plugins/toast-api/js/api/api'

/**
 * What the library and Toast API plugins add to the plugin API. Every plugin is type-checked as its own project, so the
 * plugins that depend on them see these additions through this shared file instead of through the plugins' own sources.
 */
declare module '@valenced/plugins/types' {
	interface PluginApi {
		toasts: ToastApi
	}
	interface UnscopedPluginApi {
		toasts: ToastApi
		kmmiio: typeof KmmiioLib
	}
}
