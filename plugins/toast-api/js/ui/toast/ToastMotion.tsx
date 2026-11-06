import { close } from '../../api/engine'
import { ToastCard } from './ToastCard'
import type { ToastApiSettings, ToastEntry } from '../../types'

/**
 * Spring configs lifted verbatim from Discord's legacy `ToastContainer`.
 * The opacity spring is overshoot-clamped; the position spring is not.
 */
const OPACITY_SPRING_PHYSICS = {
	mass: 0.1,
	damping: 10,
	stiffness: 100,
	overshootClamping: true,
}

const TOAST_SPRING_PHYSICS = {
	mass: 0.35,
	damping: 15,
	stiffness: 350,
	restDisplacementThreshold: 0.1,
	restSpeedThreshold: 0.1,
}

/**
 * Legacy drives one absolute `translateY`: it starts 30px past the edge of the
 * screen and settles at the resting anchor — `safeAreaTop + 8` at the top,
 * `bottom chrome + 8` at the bottom. `ToastLayer` already anchors the stack at
 * that resting spot, so only the delta is left; this plays for the toast nearest
 * the edge, which is the one that just arrived.
 *
 * `safe + 38` minus the stack's own `safe + 8` in-set is exactly 30, so the
 * start sits 30px past the screen edge at either end — a bottom toast enters
 * with the same origin, distance and spring as a top one.
 */
export function startY(anchor: 'top' | 'bottom', safeTop: number): number {
	return anchor === 'top' ? -(safeTop + 38) : safeTop + 38
}

function isReducedMotion(): boolean {
	try {
		return (
			(valenced.discord.flux.Stores as any)?.AccessibilityStore
				?.useReducedMotion === true
		)
	} catch {
		return false
	}
}

/**
 * One toast, animated the way legacy `ToastContainer` animates it: a spring on
 * the opacity, a spring on the `translateY`, and removal deferred until the
 * position spring settles.
 *
 * `update()` also springs the card's **width** when the amount of text changes.
 * Layout cannot run on the native driver, so an invisible ruler sits beside the
 * card and measures itself; the card is pinned to its last measurement and
 * springs to the new one. The ruler is a sibling, never a parent, so measuring
 * cannot feed back into itself, and both have to render the same layout or the
 * card would be shown at a width it was not measured in.
 */
export function ToastMotion({
	entry,
	settings,
	maxWidth,
	anchor,
	safeTop,
	mode,
	onExited,
}: {
	entry: ToastEntry
	settings: ToastApiSettings
	maxWidth: number
	anchor: 'top' | 'bottom'
	safeTop: number
	mode: 'enter' | 'exit'
	onExited: () => void
}) {
	const { Animated, View } = valenced.react.ReactNative
	const { useState, useRef, useEffect, useCallback } = valenced.react.React

	const entering = mode === 'enter'
	const rest = 0
	const edge = startY(anchor, safeTop)
	const from = entering ? edge : rest
	const to = entering ? rest : edge

	const [values] = useState(() => ({
		opacity: new Animated.Value(entering ? 0 : 1),
		translateY: new Animated.Value(from),
		width: new Animated.Value(0),
	}))
	const [pinned, setPinned] = useState(false)
	const natural = useRef(0)
	const widthSpring = useRef<any>(null)

	const exited = useRef(onExited)
	exited.current = onExited

	useEffect(() => {
		const toOpacity = entering ? 1 : 0

		if (isReducedMotion()) {
			values.opacity.setValue(toOpacity)
			values.translateY.setValue(to)
			if (!entering) exited.current()
			return
		}

		const fade = Animated.spring(values.opacity, {
			toValue: toOpacity,
			useNativeDriver: true,
			...OPACITY_SPRING_PHYSICS,
		})
		const move = Animated.spring(values.translateY, {
			toValue: to,
			useNativeDriver: true,
			...TOAST_SPRING_PHYSICS,
		})
		fade.start()
		move.start(({ finished }: { finished: boolean }) => {
			if (finished && !entering) exited.current()
		})
		return () => {
			fade.stop()
			move.stop()
		}
		// Remounted (via `key`) whenever `mode` flips, so it runs once per mount.
	}, [])

	useEffect(
		() => () => {
			widthSpring.current?.stop?.()
		},
		[],
	)

	const measure = useCallback(
		(event: any) => {
			const next = event?.nativeEvent?.layout?.width
			if (typeof next !== 'number' || !(next > 0)) return
			if (!pinned) {
				natural.current = next
				values.width.setValue(next)
				setPinned(true)
				return
			}
			if (Math.abs(next - natural.current) < 0.5) return
			natural.current = next
			widthSpring.current?.stop?.()
			if (isReducedMotion()) {
				values.width.setValue(next)
				return
			}
			const spring = Animated.spring(values.width, {
				toValue: next,
				useNativeDriver: false,
				...TOAST_SPRING_PHYSICS,
			})
			widthSpring.current = spring
			spring.start()
		},
		[pinned, values],
	)

	// An exiting toast is already on its way off screen, so a tap should not run
	// its handler again.
	const pressable = entering && typeof entry.onPress === 'function'
	const handlePress = useCallback(() => {
		if (!entry.onPress) return
		try {
			entry.onPress(entry.id)
		} catch (error) {
			console.warn('[toast-api] onPress failed', error)
		}
		// Opting out is per-toast: `closeOnPress: false` leaves it on screen.
		if (entry.closeOnPress !== false) close(entry.id)
	}, [entry])

	// `box-none` everywhere above the card so a tap falls through to the app the
	// moment the toast is not pressable, and lands on the card the moment it is.
	const pass = pressable ? 'box-none' : 'none'
	const hide = !pressable

	return (
		<View
			pointerEvents={pass}
			accessibilityElementsHidden={hide}
			importantForAccessibility={pressable ? 'auto' : 'no-hide-descendants'}
			style={{ width: '100%', alignItems: 'center' }}
		>
			<View
				pointerEvents="none"
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					top: 0,
					opacity: 0,
					alignItems: 'center',
				}}
			>
				<View onLayout={measure}>
					<ToastCard entry={entry} settings={settings} maxWidth={maxWidth} />
				</View>
			</View>

			<Animated.View
				pointerEvents={pass}
				style={{
					opacity: values.opacity,
					transform: [{ translateY: values.translateY }],
				}}
			>
				<Animated.View
					pointerEvents={pass}
					style={pinned ? { width: values.width } : undefined}
				>
					<ToastCard
						entry={entry}
						settings={settings}
						maxWidth={maxWidth}
						fill={pinned}
						onPress={pressable ? handlePress : undefined}
					/>
				</Animated.View>
			</Animated.View>
		</View>
	)
}
