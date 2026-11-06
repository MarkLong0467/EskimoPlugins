let container: any
const PLUGIN_ID = 'marklong.multi-scrobbler'

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

export function getHTTPUtils(): any {
	const result = kmmiioLib()?.getHTTPUtils()
	log('httpUtils', 'resolve', result != null)
	return result
}

export function primeActivityModule(): any {
	const result = kmmiioLib()?.primeActivityModule()
	log('activityAction', 'resolve', result != null)
	return result
}

export function getAssetManager(): any {
	const result = kmmiioLib()?.getAssetManager()
	log('assetManager', 'resolve', result != null)
	return result
}

export function getSelfPresenceStore(): any {
	const result = kmmiioLib()?.getSelfPresenceStore()
	log('store:SelfPresenceStore', 'resolve', result != null)
	return result
}

export function getUserStore(): any {
	const result = kmmiioLib()?.getUserStore()
	log('store:UserStore', 'resolve', result != null)
	return result
}
