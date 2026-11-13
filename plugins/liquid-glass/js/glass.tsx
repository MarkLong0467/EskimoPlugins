/**
 * The three things callstack/liquid-glass exports, with the same names and props.
 *
 * On iOS 26, when the native `LiquidGlassView` and `LiquidGlassContainerView` are in the app, they are used as they are
 * (`animationDuration` is sent in seconds, as the library does). Everywhere else, as on Android, the library draws a plain
 * `View` and `isLiquidGlassSupported` is false. The one change: that `View` gets a see-through, frosted background (see
 * `frost`) unless the effect is `none`, so a surface looks like glass. Styles given by the caller come after it and win.
 */

import { createElement } from 'react'
import {
	Platform,
	requireNativeComponent,
	UIManager,
	useColorScheme,
	View,
} from 'react-native'
import type { ComponentType } from 'react'
import type { ColorValue } from 'react-native'
import type {
	LiquidGlassContainerViewProps,
	LiquidGlassViewProps,
} from './types'

/** The names of the native views in the iOS library. */
const GLASS = 'LiquidGlassView'
const CONTAINER = 'LiquidGlassContainerView'

/** The native view with this name, or undefined when the app has none (any phone but iOS 26 with the library). */
function nativeView(name: string): ComponentType<Record<string, unknown>> | undefined {
	if (Platform.OS !== 'ios') return undefined
	try {
		const has = (
			UIManager as unknown as {
				hasViewManagerConfig?: (name: string) => boolean
			}
		).hasViewManagerConfig
		if (has && !has.call(UIManager, name)) return undefined
		return requireNativeComponent(name) as unknown as ComponentType<
			Record<string, unknown>
		>
	} catch {
		return undefined
	}
}

const NativeGlass = nativeView(GLASS)
const NativeContainer = nativeView(CONTAINER)

/** Whether the phone draws real liquid glass. */
export const isLiquidGlassSupported = !!NativeGlass

/** The look of the fallback: a faint white fill and a hairline edge, more of both for `regular` than for `clear`. */
export function frost(
	effect: string,
	dark: boolean,
	tint: ColorValue | undefined,
): Record<string, unknown> {
	if (effect === 'none') return {}
	const fill = effect === 'clear' ? 0.08 : 0.16
	const edge = effect === 'clear' ? 0.18 : 0.28
	return {
		backgroundColor: tint ?? `rgba(255,255,255,${dark ? fill : fill + 0.18})`,
		borderWidth: 1,
		borderColor: `rgba(255,255,255,${dark ? edge : edge + 0.1})`,
		overflow: 'hidden',
	}
}

/**
 * A view that adds the iOS liquid glass effect.
 */
export function LiquidGlassView(props: LiquidGlassViewProps) {
	const {
		interactive,
		effect = 'regular',
		animated,
		animationDuration,
		tintColor,
		colorScheme = 'system',
		style,
		...rest
	} = props
	const system = useColorScheme()
	if (NativeGlass) {
		return createElement(NativeGlass, {
			...rest,
			style,
			interactive,
			effect,
			animated,
			tintColor,
			colorScheme,
			animationDuration:
				animationDuration === undefined ? undefined : animationDuration / 1000,
			hasAnimationDuration: animationDuration !== undefined,
		})
	}
	const dark = (colorScheme === 'system' ? system : colorScheme) !== 'light'
	return createElement(View, {
		...rest,
		style: [frost(effect, dark, tintColor), style],
	})
}

/**
 * A view that renders multiple glass elements into a combined effect.
 */
export function LiquidGlassContainerView(props: LiquidGlassContainerViewProps) {
	const { spacing, ...rest } = props
	if (NativeContainer) return createElement(NativeContainer, { ...rest, spacing })
	return createElement(View, rest)
}
