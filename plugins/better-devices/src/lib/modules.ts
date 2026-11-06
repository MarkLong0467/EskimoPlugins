const importedCache = new Map<string, any>()

export function byImported(path: string): any {
	const cached = importedCache.get(path)
	if (cached !== undefined) return cached
	try {
		const [exports] =
			valenced.discord.utils.modules.finders.lookupModuleWithImportedPath(path)
		if (exports != null) {
			importedCache.set(path, exports)
			return exports
		}
		return undefined
	} catch {
		return undefined
	}
}

// AuthSessionsStore's module default-export is the store instance itself.
export function getSessionsStore(): any {
	const ns = byImported('modules/auth_sessions/AuthSessionsStore.tsx')
	return ns?.default ?? ns
}

export function getAuthSessionsActionCreators(): any {
	return byImported('modules/auth_sessions/AuthSessionsActionCreators.tsx')
}

/** The dock's "You" bar. Its genuine name is a minified `n` inside a memo,
 *  so match by module identity, never by name. */
export function getYouBarComponent(): any {
	return byImported('modules/main_tabs_v2/native/you_bar/YouBar.tsx')?.default
}

let capturedFormCheckbox: any

/** Records the genuine FormCheckbox the instant the runtime renders one. */
export function captureFormCheckbox(type: any): void {
	if (capturedFormCheckbox != null) return
	if (
		type == null ||
		typeof type !== 'function' ||
		type.name !== 'FormCheckbox'
	)
		return
	capturedFormCheckbox = type
	;(console as any)?.info?.('[sessions] captured native FormCheckbox')
}

/** The native animated checkbox captured from a live render. */
export function getFormCheckbox(): any {
	return capturedFormCheckbox
}

let circleInfoIconRef: any

/** The design `CircleInformationIcon`, resolved via module path. */
export function getCircleInformationIcon(): any {
	if (circleInfoIconRef !== undefined) return circleInfoIconRef
	const ns = byImported(
		'design/components/Icon/native/redesign/generated/CircleInformationIcon.tsx',
	)
	const component = ns?.CircleInformationIcon ?? ns?.default
	circleInfoIconRef = component ?? null
	if (component != null) {
		;(console as any)?.info?.('[sessions] resolved Callout info icon')
	}
	return circleInfoIconRef
}

/** `useNativeStackNavigation` hook for the settings native stack. */
export function getUseNativeStackNavigation(): any {
	return byImported(
		'design/components/Navigator/native/useNavigation.native.tsx',
	)?.useNativeStackNavigation
}

export function getOpenUserSettings(): any {
	return byImported('modules/user_settings/core/native/openUserSettings.tsx')
}

export function getSessionsSection(): string | undefined {
	try {
		const sections = (valenced as any).discord?.common?.constants?.Constants
			?.UserSettingsSections
		// The Devices screen registers under the SESSIONS section.
		return sections?.SESSIONS ?? sections?.ACCOUNT
	} catch {
		return undefined
	}
}

export function getConstants(): any {
	try {
		return (valenced as any).discord?.common?.constants?.Constants
	} catch {
		return undefined
	}
}
