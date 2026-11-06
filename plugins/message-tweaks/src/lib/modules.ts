let container: any
const PLUGIN_ID = 'marklong.message-tweaks'

export function initKmmiioLib(api: any) {
	container = api
}

/**
 * The library instance, read through the api on every call.
 *
 * The api object is stable but `unscoped.kmmiio` is filled in by the lib
 * plugin's `decorate`, which can land after this plugin's `start` runs. Holding
 * the value instead of the api would freeze `undefined` into the stash and
 * every later call, `forceLoadLazySheets` among them, would stay a no-op.
 */
export function kmmiioLib(): any {
	return container?.unscoped?.kmmiio
}

function log(module: string, action: string, found: boolean) {
	kmmiioLib()?.logUsage?.(PLUGIN_ID, module, action, found)
}

export function isComponentType(v: any): boolean {
	return kmmiioLib()?.isComponentType(v) ?? false
}

export function resolveComponent(exports: any): any {
	return kmmiioLib()?.resolveComponent(exports)
}

export function getDisplayNameFilter(name: string) {
	const result = kmmiioLib()?.getDisplayNameFilter(name)
	log('filter:displayName', 'create', result != null)
	return result
}

export function getPropsFilter(...props: string[]) {
	const result = kmmiioLib()?.getPropsFilter(...props)
	log('filter:props', 'create', result != null)
	return result
}

export function getUserStore(): any {
	const result = kmmiioLib()?.getUserStore?.()
	log('store:UserStore', 'resolve', result != null)
	return result
}

export function getCurrentUserId(): string | undefined {
	try {
		return getUserStore()?.getCurrentUser?.()?.id
	} catch {
		return undefined
	}
}

export function getIcon(name: string): () => any {
	const result = kmmiioLib()?.getIcon(name)
	log('icon', `resolve:${name}`, result != null)
	return result
}

/** Load a Discord module by its stable source path and call `cb` once resolved. */
export function onImportedPath<T = any>(
	path: string,
	cb: (namespace: T) => void,
): () => void {
	const result = kmmiioLib()?.onImportedPath?.(path, cb)
	log('finder:importedPath', path, result != null)
	return result ?? (() => {})
}

export function forceInitModule(filter: any): void {
	kmmiioLib()?.forceInitModule?.(filter)
}

let channelMessages: any

export function getChannelMessagesCache(): any {
	if (!channelMessages) {
		try {
			kmmiioLib()?.onImportedPath?.('lib/ChannelMessages.tsx', (ns: any) => {
				channelMessages = ns?.default ?? ns
			})
		} catch {}
	}
	return channelMessages
}

export function onChannelMessages(cb: (cache: any) => void): () => void {
	return onImportedPath('lib/ChannelMessages.tsx', (ns: any) => {
		channelMessages = ns?.default ?? ns
		cb(channelMessages)
	})
}
