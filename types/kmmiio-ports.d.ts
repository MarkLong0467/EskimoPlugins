import type { ToastApi } from '../plugins/toast-api/js/api/api'

/**
 * What the Toast API plugin adds to the plugin API. Every plugin is type-checked as its own project, so the plugins that
 * use it see this addition through this shared file instead of through Toast API's own sources.
 */
declare module '@valenced/plugins/types' {
	interface PluginApi {
		toasts: ToastApi
	}
	interface UnscopedPluginApi {
		toasts: ToastApi
	}
}
