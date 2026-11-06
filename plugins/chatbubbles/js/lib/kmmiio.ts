let container: any

/**
 * Binds the library instance handed over by the lib plugin's unscoped api.
 *
 * The library used to be published on `globalThis`. It is not anymore, so every
 * consumer resolves it through the api it already receives in `start`.
 */
export function initKmmiioLib(api: any) {
	container = api
}

export function kmmiio(): any {
	return container?.unscoped?.kmmiio
}
