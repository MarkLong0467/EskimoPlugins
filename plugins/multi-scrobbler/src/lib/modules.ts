import { KmmiioLib } from '../../../../shared/kmmiio/lib/api'

let container: any
const PLUGIN_ID = 'marklong.multi-scrobbler'

export function initKmmiioLib(api: any) {
	container = api
}

/**
 * The library instance, read through the api on every call.
 *
 * The library is bundled into this plugin, so it is always there.
 */
export function kmmiioLib(): any {
	return KmmiioLib
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
