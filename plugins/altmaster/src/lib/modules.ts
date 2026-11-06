let container: any

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

export function getUserStore(): any {
	return kmmiioLib()?.getUserStore?.()
}

export function getCurrentUserId(): string | undefined {
	try {
		return getUserStore()?.getCurrentUser?.()?.id
	} catch {
		return undefined
	}
}

export function getIcon(name: string): (() => any) | undefined {
	return kmmiioLib()?.getIcon?.(name)
}

/**
 * The profile sheet this plugin opens.
 *
 * The library resolves sheets generically, so each plugin declares the ones it
 * owns. Stable object because the library memoizes per spec.
 */
const PROFILE_SHEET = {
	prop: [
		'showUserProfileActionSheetPostConnection',
		'getUserProfileActionSheetKey',
	],
	anchor: 'openLazy',
} as const

export function openUserProfileSheet(
	options: Record<string, unknown>,
): boolean {
	const opener = kmmiioLib()?.resolveSheet?.(PROFILE_SHEET)
	if (typeof opener !== 'function') return false
	try {
		opener(options)
		return true
	} catch {
		return false
	}
}

/** Resolve a Discord module by its stable source path and call `cb` once it's loaded. */
export function onImportedPath<T = any>(
	path: string,
	cb: (namespace: T) => void,
): () => void {
	const result = kmmiioLib()?.onImportedPath?.(path, cb)
	return result ?? (() => {})
}

let react: any
let design: any
let alertActions: any

export function getReact(): any {
	if (!react) {
		try {
			react = (valenced as any).react
		} catch {}
	}
	return react
}

export function getDesign(): any {
	if (!design) {
		try {
			design = (valenced as any).discord?.design?.Design
		} catch {}
	}
	return design
}

export function getAlertActions(): any {
	if (!alertActions) {
		try {
			alertActions = (valenced as any).discord?.actions?.AlertActionCreators
		} catch {}
	}
	return alertActions
}
