import { existsSync } from '@valenced/modules/native/fs'
import { pluginStorageDirFor } from '@valenced/plugins/constants'
import { shared } from './shared'

export interface RegisteredPlugin {
	id: string
	name: string
	description: string
	author?: string
	icon?: string
	version: { nums: number[]; label?: string }
	getStatus: () => string | number
	getErrors: () => readonly unknown[]
}

/**
 * Whether a plugin is installed.
 *
 * Valenced only exposes its live plugin list to Developer Mode (`@valenced/plugins/_`), which a plugin cannot rely on, so
 * this answers from what is public: a plugin running right now is installed, and otherwise the plugin's storage directory
 * decides. A storage directory outlives an uninstall, so a removed plugin can still read as installed. Use
 * `isPluginRunning` when you need to know the plugin is active.
 */
export function isPluginInstalled(id: string): boolean {
	if (registry.has(id)) return true
	try {
		return existsSync(pluginStorageDirFor(id)) === true
	} catch {
		return false
	}
}

const registry = shared('registry', () => new Map<string, RegisteredPlugin>())
const listeners = shared('registryListeners', () => new Set<() => void>())

function notify() {
	console.log(
		'[kmmiio-lib] registry: notify, size:',
		registry.size,
		'keys:',
		Array.from(registry.keys()),
	)
	for (const fn of listeners) fn()
}

export function registerPlugin(plugin: RegisteredPlugin) {
	console.log(
		'[kmmiio-lib] registry: registerPlugin called, id:',
		plugin.id,
		'name:',
		plugin.name,
	)
	registry.set(plugin.id, plugin)
	notify()
}

/**
 * Whether a plugin is running in this process right now.
 *
 * Unlike `isPluginInstalled`, this is driven by the plugin's own lifecycle
 * rather than inferred: plugins register from `start` and unregister from
 * `stop`. It therefore reflects a disable or an uninstall immediately, needs
 * neither the hidden developer API nor a disk heuristic, and cannot report a
 * plugin that has only ever run before.
 */
export function isPluginRunning(id: string): boolean {
	return registry.has(id)
}

export function unregisterPlugin(id: string) {
	if (registry.delete(id)) notify()
}

export function getRegisteredPlugin(id: string): RegisteredPlugin | undefined {
	const result = registry.get(id)
	console.log(
		'[kmmiio-lib] registry: getRegisteredPlugin(',
		id,
		') =>',
		result?.name ?? 'undefined',
	)
	return result
}

export function getAllRegisteredPlugins(): RegisteredPlugin[] {
	return Array.from(registry.values())
}

export function onRegistryChange(fn: () => void): () => void {
	console.log(
		'[kmmiio-lib] registry: onRegistryChange listener added, current size:',
		registry.size,
	)
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}
