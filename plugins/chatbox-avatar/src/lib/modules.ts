let container: any
const PLUGIN_ID = 'marklong.chatbox-avatar'

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

export function getDisplayNameFilter(name: string) {
	const result = kmmiioLib()?.getDisplayNameFilter(name)
	log('filter:displayName', 'create', result != null)
	return result
}

export function isComponentType(v: any): boolean {
	return kmmiioLib()?.isComponentType(v) ?? false
}

export function resolveComponent(exports: any): any {
	return kmmiioLib()?.resolveComponent(exports)
}

export function getAvatar(): any {
	const result = kmmiioLib()?.getAvatar()
	log('avatar', 'resolve', result != null)
	return result
}

export function resolveColor(semToken: string): string | undefined {
	return kmmiioLib()?.resolveColor?.(semToken)
}

export function getUserStore(): any {
	const result = kmmiioLib()?.getUserStore()
	log('store:UserStore', 'resolve', result != null)
	return result
}

export function getSelfPresenceStore(): any {
	const result = kmmiioLib()?.getSelfPresenceStore()
	log('store:SelfPresenceStore', 'resolve', result != null)
	return result
}

export function getSelectedChannelStore(): any {
	const result = kmmiioLib()?.getSelectedChannelStore()
	log('store:SelectedChannelStore', 'resolve', result != null)
	return result
}

export function getChannelStore(): any {
	const result = kmmiioLib()?.getChannelStore()
	log('store:ChannelStore', 'resolve', result != null)
	return result
}

export function getTriggerHapticFeedback(): any {
	const result = kmmiioLib()?.getTriggerHapticFeedback()
	log('haptics', 'resolve', result != null)
	return result
}

export function getHapticFeedbackTypes(): any {
	const result = kmmiioLib()?.getHapticFeedbackTypes()
	log('hapticsTypes', 'resolve', result != null)
	return result
}

/**
 * The sheets this plugin opens.
 *
 * The library resolves sheets generically, so each plugin declares the ones it
 * owns. These are stable objects because the library memoizes per spec.
 */
const ACCOUNT_SHEET = {
	prop: 'showYouAccountActionSheet',
	anchor: 'openLazy',
} as const

const PROFILE_SHEET = {
	prop: [
		'showUserProfileActionSheetPostConnection',
		'getUserProfileActionSheetKey',
	],
	anchor: 'openLazy',
} as const

/**
 * Opens the same sheet Discord's you bar opens on long press.
 *
 * `showYouAccountActionSheet` takes `(statusOnly, disableHapticOnOpen)` and the
 * you bar calls it with no arguments, which opens the full account sheet.
 * Passing `statusOnly` opens the reduced status-only sheet instead.
 */
export function openAccountSheet() {
	const sheet = kmmiioLib()?.resolveSheet(ACCOUNT_SHEET)
	const found = typeof sheet === 'function'
	if (found) sheet()
	log('sheets:account', 'open', found)
}

/** Opens a user's profile sheet, which is the sheet carrying a `userId`. */
export function openUserProfileSheet(userId: string, channelId?: string) {
	const sheet = kmmiioLib()?.resolveSheet(PROFILE_SHEET)
	const found = typeof sheet === 'function'
	if (found) sheet({ userId, channelId })
	log('sheets:profile', 'open', found)
}

/** Warms both sheets without opening one, so the first tap is not wasted. */
export function forceLoadLazySheets(): void {
	const lib = kmmiioLib()
	const resolved = [ACCOUNT_SHEET, PROFILE_SHEET].filter(
		spec => typeof lib?.resolveSheet?.(spec) === 'function',
	).length
	log('sheets:lazyLoad', 'forceLoad', resolved === 2)
}
