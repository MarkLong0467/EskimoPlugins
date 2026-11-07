/**
 * The flame button in the chat box. Tap it to turn flame text on or off. It glows when it is on.
 *
 * Discord draws the chat box's buttons with two components, `ChatInputActions` (the row of small buttons) and
 * `ChatInputSendButton`. The JSX runtime is watched for them; when one is drawn, this wraps what it draws in a row that has the
 * flame button next to it. The settings pick which of the two gets the button.
 */

import { afterJSX } from '@valenced/react/jsx-runtime'
import { createElement, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { installJsxFinder } from '../../../shared/palmdevs/jsxFind'
import { diag } from './diag'
import { state } from './state'
import { setting, store } from './store'
import { switchFlame } from './toggle'
import type { ReactElement } from 'react'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** The flame, as a constant because React Native text must be passed as an expression. */
const FLAME = '\u{1F525}'
const ON_HINT = 'Flame text is on. Tap to turn it off'
const OFF_HINT = 'Flame text is off. Tap to turn it on'

/** The button. */
export function FlameButton() {
	const [, redraw] = useState(0)
	useEffect(() => store.subscribe(() => redraw(n => n + 1)), [])
	if (!setting('button')) return null
	state.buttonDrawn++
	const on = setting('on')
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={on ? ON_HINT : OFF_HINT}
			accessibilityState={{ selected: on }}
			hitSlop={6}
			onPress={() => {
				try {
					state.buttonTaps++
					switchFlame()
				} catch (error) {
					diag.fail('flame button', error)
				}
			}}
			style={{
				width: 36,
				height: 36,
				borderRadius: 18,
				marginHorizontal: 2,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: on ? 'rgba(255,106,0,0.32)' : 'transparent',
				borderWidth: on ? 1.5 : 0,
				borderColor: '#ff6a00',
			}}
		>
			<Text style={{ fontSize: 20, opacity: on ? 1 : 0.5 }}>{FLAME}</Text>
		</Pressable>
	)
}

const ROW = { flexDirection: 'row', alignItems: 'center' } as const

/**
 * Watches for the chat box's buttons and puts the flame button next to them.
 *
 * @param cleanup Where to register what undoes it.
 */
export function installButton(cleanup: Cleanup): void {
	const hooked = new WeakSet<object>()
	const hook = (type: unknown, spot: 'send' | 'actions'): void => {
		if (!type || (typeof type !== 'object' && typeof type !== 'function'))
			return
		if (hooked.has(type as object)) return
		hooked.add(type as object)
		diag.log(
			'found',
			`Found the chat box ${spot === 'send' ? 'send button' : 'buttons'}`,
		)
		cleanup(
			afterJSX(
				type as never,
				((element: ReactElement) => {
					const chosen = setting('buttonSpot')
					if (!setting('button') || (chosen !== 'both' && chosen !== spot))
						return element
					return createElement(
						View,
						{ style: ROW },
						createElement(FlameButton),
						element,
					)
				}) as never,
			) as never,
		)
	}
	state.jsx = installJsxFinder(cleanup, [
		{
			name: 'ChatInputSendButton',
			seen(type) {
				state.sendButtonSeen = true
				hook(type, 'send')
			},
		},
		{
			name: 'ChatInputActions',
			seen(type) {
				state.actionsSeen = true
				hook(type, 'actions')
			},
		},
	])
}
