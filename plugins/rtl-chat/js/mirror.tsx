import { ReactNavigationNative } from '@valenced/externals/react-navigation'
import { lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { after, instead } from '@valenced/patcher'
import { cloneElement, useEffect, useState } from 'react'
import { AppRegistry, StyleSheet, View } from 'react-native'
import { FLIP } from './constants'
import { hooked, listen, mirrored, setting } from './state'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import type { AppRegistryLike } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** A function that is patched. */
type AnyFunction = (...args: unknown[]) => unknown

/*
 * Mirror everything: the whole app is flipped sideways.
 *
 * Several places could hold the root of the app, so each is tried until one works, and the hooks that only wait for the
 * root are always installed but flip nothing unless the style is "mirror". `mayWrap` makes sure only one of them flips.
 */

/**
 * Whether the hook with this name may flip the app. The first hook to ask is the one that flips; others are refused, so
 * the app is never flipped twice.
 */
function mayWrap(name: string): boolean {
	if (hooked.fired && hooked.fired !== name) return false
	hooked.fired = name
	return true
}

/** Flips what is inside it sideways when the style is "mirror everything", and follows the setting as it changes. */
function Mirror({ children }: { children?: ReactNode }) {
	const [, setTick] = useState(0)
	useEffect(() => listen(() => setTick(n => n + 1)), [])
	return (
		<View style={{ flex: 1, transform: mirrored() ? FLIP : [] }}>
			{children}
		</View>
	)
}

/** What puts the registered apps back as they were when the plugin stops. */
let undo: Array<() => void> = []

/** Puts every app Discord registered back as it was. */
export function restoreApps(): void {
	for (const fn of undo) {
		try {
			fn()
		} catch {
			// The app is already gone.
		}
	}
	undo = []
}

/**
 * Wraps every app in React Native's registry in the flipping view, by registering it again with a provider that wraps the
 * original. The original is put back when the plugin stops.
 *
 * @returns Whether at least one app was wrapped.
 */
export function wrapRegistry(): boolean {
	const registry = AppRegistry as unknown as AppRegistryLike | undefined
	if (
		!registry ||
		typeof registry.getAppKeys !== 'function' ||
		typeof registry.getRunnable !== 'function' ||
		typeof registry.registerComponent !== 'function'
	)
		return false
	const done: string[] = []
	for (const key of registry.getAppKeys() || []) {
		const runnable = registry.getRunnable(key)
		const provider = runnable?.componentProvider
		if (typeof provider !== 'function') continue
		const section = runnable?.section
		registry.registerComponent(
			key,
			() => {
				const Inner = provider() as ComponentType<Record<string, unknown>>
				return function RtlRoot(rootProps: Record<string, unknown>) {
					return (
						<Mirror>
							<Inner {...rootProps} />
						</Mirror>
					)
				}
			},
			section,
		)
		undo.push(() => registry.registerComponent?.(key, provider, section))
		done.push(key)
	}
	hooked.keys = done
	return done.length > 0
}

/** Roots already wrapped, so the same root is wrapped once. */
const wrapped = new Map<unknown, unknown>()

/** A root component wrapped in the flipping view. */
function wrapRoot(Root: unknown): unknown {
	if (typeof Root !== 'function' && !(Root && typeof Root === 'object'))
		return Root
	const known = wrapped.get(Root)
	if (known) return known
	const Inner = Root as ComponentType<Record<string, unknown>>
	const Wrapped = function RtlRoot(rootProps: Record<string, unknown>) {
		return (
			<Mirror>
				<Inner {...rootProps} />
			</Mirror>
		)
	}
	wrapped.set(Root, Wrapped)
	return Wrapped
}

/** Wraps the root that React Native's `renderApplication` is given. */
export function wrapRenderApplication(cleanup: Cleanup): boolean {
	const found = lookupModule(withName('renderApplication'))[0] as unknown as
		| { default?: unknown }
		| undefined
	if (!found || typeof found.default !== 'function') return false
	cleanup(
		instead(
			found as { default: AnyFunction },
			'default',
			function (args, original) {
				const next = args.slice()
				try {
					next[0] = wrapRoot(args[0])
				} catch {
					// The root is used as it was.
				}
				return Reflect.apply(original, this, next)
			},
		),
	)
	return true
}

/** Wraps the element React Native renders as the root of the app (the one with `rootTag` and `initialProps`). */
export function wrapRootElement(cleanup: Cleanup): boolean {
	const runtime =
		(lookupModule(withProps('jsx', 'jsxs'))[0] as
			| Record<string, unknown>
			| undefined) ||
		(valenced.react.ReactJSXRuntime as unknown as Record<string, unknown>)
	let guard = false
	const wrapIfRoot = (drawn: unknown) => {
		const el = drawn as ReactElement<Record<string, unknown>> | null | undefined
		if (
			guard ||
			!el ||
			typeof el !== 'object' ||
			!el.props ||
			el.props.rootTag === undefined ||
			!('initialProps' in el.props) ||
			!mayWrap('root element')
		)
			return drawn
		guard = true
		try {
			return <Mirror>{el}</Mirror>
		} finally {
			guard = false
		}
	}
	for (const name of ['jsx', 'jsxs']) {
		if (runtime && typeof runtime[name] === 'function')
			cleanup(
				after(
					runtime as Record<string, AnyFunction>,
					name,
					wrapIfRoot as never,
				),
			)
	}
	// React itself is patched, so it is reached through the unscoped API (a namespace import would be a copy).
	const React = valenced.react.React as unknown as
		| Record<string, AnyFunction>
		| undefined
	if (React && typeof React.createElement === 'function')
		cleanup(after(React, 'createElement', wrapIfRoot as never))
	return true
}

/** Wraps what the navigation container draws. */
export function wrapNavigation(cleanup: Cleanup): boolean {
	const Container = (
		ReactNavigationNative as unknown as
			| { NavigationContainer?: { render?: unknown } }
			| undefined
	)?.NavigationContainer
	if (!Container || typeof Container.render !== 'function') return false
	cleanup(
		instead(
			Container as { render: AnyFunction },
			'render',
			function (args, original) {
				const ret = Reflect.apply(original, this, args)
				try {
					return mayWrap('navigation') ? (
						<Mirror>{ret as ReactNode}</Mirror>
					) : (
						ret
					)
				} catch {
					return ret
				}
			},
		),
	)
	return true
}

/** Wraps what React Native's `AppContainer` draws. */
export function wrapContainer(cleanup: Cleanup): boolean {
	const found = lookupModule(withName('AppContainer'))[0] as unknown as
		| (Function & { default?: unknown })
		| { default?: unknown }
		| undefined
	const cls = (typeof found === 'function' ? found : found?.default) as
		| { prototype?: { render?: unknown } }
		| undefined
	if (!cls || !cls.prototype || typeof cls.prototype.render !== 'function')
		return false
	cleanup(
		instead(
			cls.prototype as { render: AnyFunction },
			'render',
			function (args, original) {
				const ret = Reflect.apply(original, this, args)
				try {
					return mayWrap('app container') ? (
						<Mirror>{ret as ReactNode}</Mirror>
					) : (
						ret
					)
				} catch {
					return ret
				}
			},
		),
	)
	return true
}

/**
 * In the mirrored app, turns letters and pictures back the right way round (the "readable" option): it flips a text or
 * picture a second time, and right-aligns text that has no alignment of its own.
 *
 * @param Component A React Native component with a `render` function (`Image`, `Text`, `TextInput`).
 * @param isText True for text, which is also right-aligned.
 * @returns Whether the component could be patched.
 */
export function counterFlip(
	Component: unknown,
	isText: boolean,
	cleanup: Cleanup,
): boolean {
	const target = Component as { render?: unknown } | undefined
	if (!target || typeof target.render !== 'function') return false
	cleanup(
		instead(
			target as { render: AnyFunction },
			'render',
			function (args, original) {
				const el = Reflect.apply(original, this, args) as
					| ReactElement<{ style?: unknown }>
					| null
					| undefined
				try {
					if (!mirrored() || !setting('readable') || !el || !el.props) return el
					const flat = (StyleSheet.flatten(el.props.style as never) || {}) as {
						transform?: unknown[]
						textAlign?: string
					}
					const transform = Array.isArray(flat.transform) ? flat.transform : []
					const extra: Record<string, unknown> = {
						transform: FLIP.concat(transform as never[]),
					}
					if (
						isText &&
						(flat.textAlign === undefined ||
							flat.textAlign === 'auto' ||
							flat.textAlign === 'left')
					)
						extra.textAlign = 'right'
					return cloneElement(el, { style: [flat, extra] } as never)
				} catch {
					return el
				}
			},
		),
	)
	return true
}

/** The apps Discord registered, in words, for the settings screen. */
export function registryInfo(): string {
	try {
		const registry = AppRegistry as unknown as AppRegistryLike
		const keys =
			typeof registry.getAppKeys === 'function'
				? registry.getAppKeys() || []
				: []
		return (
			keys
				.map(key => {
					const r = (
						typeof registry.getRunnable === 'function'
							? registry.getRunnable(key)
							: undefined
					) as unknown
					return `${key} (${typeof r === 'function' ? 'function' : r && typeof r === 'object' ? Object.keys(r).join('/') : String(typeof r)})`
				})
				.join(', ') || 'no apps listed'
		)
	} catch {
		return 'could not read'
	}
}
