/**
 * The Flame Typing switch: hold the + button of the chat box and a small menu opens with a Flame Typing row and a slider.
 *
 * Discord draws the + button inside `ChatInputActions`. The JSX runtime is watched for it; when it is drawn, this wraps what it
 * draws in a view that only *watches* the touches (it never takes them, so taps work as before). A finger that stays down on
 * the row for a moment, without moving, opens the menu.
 */

import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { createElement, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { installJsxFinder } from '../../../shared/palmdevs/jsxFind'
import { diag } from './diag'
import { state } from './state'
import { setting, store } from './store'
import { switchFlame } from './toggle'
import type { ReactElement, ReactNode } from 'react'

type Cleanup = (...fns: Array<() => unknown>) => unknown

const SHEET_KEY = 'MARKLONG_FLAME_TEXT_MENU'
const TITLE = 'Flame Text'
const ROW_LABEL = 'Flame Typing'
const ROW_HINT =
	'Your messages are sent as burning GIFs while this is on. Hold the + button to open this menu again.'

/** How long a finger stays down before the menu opens, and how far it may wander. */
export const HOLD_MS = 450
export const HOLD_SLOP = 12

/** The menu: one row with a slider. */
export function FlameMenu() {
	const [, redraw] = useState(0)
	useEffect(() => store.subscribe(() => redraw(n => n + 1)), [])
	return (
		<Design.ActionSheet>
			<Design.BottomSheetTitleHeader title={TITLE} />
			<Design.Stack spacing={16} style={{ padding: 16, paddingBottom: 32 }}>
				<Design.TableRowGroup>
					<Design.TableSwitchRow
						label={ROW_LABEL}
						subLabel={ROW_HINT}
						value={setting('on')}
						onValueChange={(on: boolean) => {
							try {
								state.buttonTaps++
								switchFlame(on)
							} catch (error) {
								diag.fail('flame menu', error)
							}
						}}
					/>
				</Design.TableRowGroup>
			</Design.Stack>
		</Design.ActionSheet>
	)
}

/** Opens the menu. */
export function openMenu(): void {
	try {
		ActionSheetActionCreators.openLazy(
			Promise.resolve({ default: () => <FlameMenu /> }),
			SHEET_KEY,
			{},
		)
		state.menuOpened++
	} catch (error) {
		diag.fail('open the flame menu', error)
	}
}

/** The touch events this reads from a finger. */
interface Touch {
	nativeEvent?: { pageX?: number; pageY?: number }
}

/** A view that opens the menu when a finger is held on what is inside it. It never takes the touch away from what is inside. */
export function HoldWatcher({ children }: { children?: ReactNode }) {
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const from = useRef({ x: 0, y: 0 })
	const stop = () => {
		if (timer.current) clearTimeout(timer.current)
		timer.current = undefined
	}
	useEffect(() => stop, [])
	return (
		<View
			style={ROW}
			onTouchStart={(event: Touch) => {
				stop()
				from.current = {
					x: event.nativeEvent?.pageX ?? 0,
					y: event.nativeEvent?.pageY ?? 0,
				}
				timer.current = setTimeout(() => {
					timer.current = undefined
					if (setting('button')) openMenu()
				}, HOLD_MS)
			}}
			onTouchMove={(event: Touch) => {
				const dx = (event.nativeEvent?.pageX ?? 0) - from.current.x
				const dy = (event.nativeEvent?.pageY ?? 0) - from.current.y
				if (Math.hypot(dx, dy) > HOLD_SLOP) stop()
			}}
			onTouchEnd={stop}
			onTouchCancel={stop}
		>
			{children}
		</View>
	)
}

const ROW = { flexDirection: 'row', alignItems: 'center' } as const

/**
 * Watches for the chat box's buttons and makes holding them open the menu.
 *
 * @param cleanup Where to register what undoes it.
 */
export function installButton(cleanup: Cleanup): void {
	const hooked = new WeakSet<object>()
	const hook = (type: unknown): void => {
		if (!type || (typeof type !== 'object' && typeof type !== 'function'))
			return
		if (hooked.has(type as object)) return
		hooked.add(type as object)
		diag.log('found', 'Found the chat box buttons')
		cleanup(
			afterJSX(
				type as never,
				((element: ReactElement) => {
					if (!setting('button')) return element
					state.buttonDrawn++
					return createElement(HoldWatcher, null, element)
				}) as never,
			) as never,
		)
	}
	state.jsx = installJsxFinder(cleanup, [
		{
			name: 'ChatInputActions',
			seen(type) {
				state.actionsSeen = true
				hook(type)
			},
		},
	])
}
