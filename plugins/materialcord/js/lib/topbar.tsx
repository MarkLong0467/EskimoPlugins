import { openOptionsSheet } from '../ui/OptionsSheet'
import { resolveTokenHex } from './tokens'

const ROUTE_NAMES = ['APPEARANCE_THEME_PICKER', 'Appearance Theme Picker']

const wrappedScreens = new WeakMap<any, any>()
const navRecords: { nav: any; original: any; wrapped: any }[] = []
const unpatches: (() => void)[] = []
let wired = false
let hookCache: any

const { createElement, Fragment } = valenced.react.React
const { View, Image, Pressable } = valenced.react.ReactNative

function isThemePickerElement(props: any): boolean {
	if (props == null) return false
	const name = props.route?.name
	if (typeof name === 'string' && ROUTE_NAMES.includes(name)) return true
	try {
		const routes = props.navigation?.getState?.()?.routes
		if (!Array.isArray(routes)) return false
		return routes.some(
			(route: any) =>
				typeof route?.name === 'string' && ROUTE_NAMES.includes(route.name),
		)
	} catch {
		return false
	}
}

function headerTint(): string | undefined {
	return resolveTokenHex('ICON_DEFAULT') ?? resolveTokenHex('TEXT_DEFAULT')
}

function Cog() {
	const { useMemo } = valenced.react.React
	const source = useMemo(() => {
		try {
			return valenced.assets.getAssetIdByName('SettingsIcon') ?? undefined
		} catch {
			return undefined
		}
	}, [])
	if (source == null) return null
	return (
		<Pressable
			onPress={openOptionsSheet}
			hitSlop={8}
			style={{ paddingHorizontal: 10, paddingVertical: 6 }}
		>
			<Image
				source={source}
				style={{ width: 22, height: 22, tintColor: headerTint() }}
			/>
		</Pressable>
	)
}

function mergeHeaderRight(options: any): any {
	if (options == null) return options
	const inner = 'headerRight' in options ? options.headerRight : undefined
	const merged: any = { ...options }
	// The cog leads so Discord's own button keeps the corner it had.
	merged.headerRight = (props: any) =>
		createElement(
			View,
			{ style: { flexDirection: 'row', alignItems: 'center' } },
			createElement(Cog, {}),
			typeof inner === 'function' ? inner(props) : (inner ?? null),
		)
	return merged
}

/**
 * `useNativeStackNavigation` from the navigator's own module — the
 * better-devices path lookup, used only when a screen element arrives
 * without its `navigation` prop.
 */
function navHook(): any {
	if (hookCache !== undefined) return hookCache
	try {
		const found =
			valenced.discord.utils.modules.finders.lookupModuleWithImportedPath(
				'design/components/Navigator/native/useNavigation.native.tsx',
			)
		const [exports] = found
		hookCache = exports?.useNativeStackNavigation ?? null
	} catch {
		hookCache = null
	}
	return hookCache
}

/**
 * Mounted as the screen's first sibling, so its effect runs before the
 * screen's own `setOptions`: every options push from the screen then flows
 * through a merger that keeps Discord's header and adds the cog.
 */
function HeaderController(props: { navigation?: any }): null {
	const React = valenced.react.React
	const [navigation] = React.useState(() => {
		if (props.navigation != null) return props.navigation
		const hook = navHook()
		if (typeof hook !== 'function') return null
		try {
			return hook()
		} catch {
			return null
		}
	})
	React.useEffect(() => {
		if (navigation == null || typeof navigation.setOptions !== 'function')
			return
		if (navigation.__materialcord === true) return
		const original = navigation.setOptions
		const wrapped = function (this: any, options: any) {
			return original.call(this, mergeHeaderRight(options))
		}
		try {
			navigation.setOptions = wrapped
		} catch {
			return
		}
		if (navigation.setOptions !== wrapped) return
		navigation.__materialcord = true
		navRecords.push({ nav: navigation, original, wrapped })
		if (!wired) {
			wired = true
			console.log('[materialcord] header button wired')
		}
		// The screen may already have pushed its header before this ran.
		try {
			wrapped({})
		} catch {}
		return () => {
			if (navigation.setOptions === wrapped) {
				try {
					navigation.setOptions = original
				} catch {}
			}
			try {
				navigation.__materialcord = undefined
			} catch {}
			for (let i = navRecords.length - 1; i >= 0; i--) {
				if (navRecords[i].nav === navigation) navRecords.splice(i, 1)
			}
		}
	}, [navigation])
	return null
}

function wrapScreen(Original: any): any {
	const cached = wrappedScreens.get(Original)
	if (cached !== undefined) return cached
	const Wrapped: any = function (this: any, props: any) {
		return createElement(
			Fragment,
			{},
			createElement(HeaderController, { navigation: props?.navigation }),
			createElement(Original, props),
		)
	}
	Wrapped.__materialcord = true
	wrappedScreens.set(Original, Wrapped)
	return Wrapped
}

function transform(type: any, props: any, args: any[]): void {
	if (type == null || type.__materialcord === true) return
	if (!isThemePickerElement(props)) return
	args[0] = wrapScreen(type)
}

/**
 * Arm the App Theme header button. The transform installs once at
 * start-up; the wrapper lands the first time the navigator renders that
 * screen.
 */
export function installTopBar(): boolean {
	if (unpatches.length > 0) return true
	const runtime = (valenced as any).react?.ReactJSXRuntime
	if (runtime == null || typeof runtime.jsx !== 'function') {
		console.warn('[materialcord] jsx runtime unavailable')
		return false
	}
	for (const key of ['jsx', 'jsxs'] as const) {
		if (typeof runtime[key] !== 'function') continue
		const unpatch = valenced.patcher.instead(
			runtime,
			key,
			(args: any[], original: any) => {
				try {
					transform(args[0], args[1], args)
				} catch {}
				return Reflect.apply(original, runtime, args)
			},
		)
		if (typeof unpatch === 'function') unpatches.push(unpatch)
	}
	if (unpatches.length === 0) {
		console.warn('[materialcord] jsx runtime patch failed')
		return false
	}
	return true
}

/** For the start-up log: the transform is armed, waiting for the screen. */
export function topbarStatus(): 'armed' | 'off' {
	return unpatches.length > 0 ? 'armed' : 'off'
}

export function uninstallTopBar(): void {
	for (const unpatch of unpatches) {
		try {
			unpatch()
		} catch {}
	}
	unpatches.length = 0
	for (const record of navRecords.splice(0)) {
		if (record.nav.setOptions === record.wrapped) {
			try {
				record.nav.setOptions = record.original
			} catch {}
		}
		try {
			record.nav.__materialcord = undefined
		} catch {}
	}
	wired = false
}
