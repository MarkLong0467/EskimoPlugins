/**
 * An optional flame button in the chat box, to the left of the emoji button. Tap it to turn flame text on or off. It glows when it
 * is on.
 *
 * Discord draws the emoji button (with the gift button) in `ChatInputRightActions`. The JSX runtime is watched for it; when it is
 * drawn, this wraps what it draws in a row that has the flame button in front.
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
const ROW = { flexDirection: 'row', alignItems: 'center' } as const

/** The button. */
export function FlameButton() {
	const [, redraw] = useState(0)
	useEffect(() => store.subscribe(() => redraw(n => n + 1)), [])
	if (!setting('chatButton')) return null
	const on = setting('on')
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={on ? ON_HINT : OFF_HINT}
			accessibilityState={{ selected: on }}
			hitSlop={6}
			onPress={() => {
				try {
					state.chatTaps++
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

/**
 * Watches for the chat box's right-hand buttons and puts the flame button in front of them.
 *
 * @param cleanup Where to register what undoes it.
 */
export function installChatButton(cleanup: Cleanup): void {
	const hooked = new WeakSet<object>()
	state.chatWatched = installJsxFinder(cleanup, [
		{
			name: 'ChatInputRightActions',
			seen(type) {
				state.chatSeen = true
				if (!type || (typeof type !== 'object' && typeof type !== 'function'))
					return
				if (hooked.has(type as object)) return
				hooked.add(type as object)
				diag.log('found', 'Found the chat box emoji button')
				cleanup(
					afterJSX(
						type as never,
						((element: ReactElement) => {
							if (!setting('chatButton')) return element
							state.chatDrawn++
							return createElement(
								View,
								{ style: ROW },
								createElement(FlameButton),
								element,
							)
						}) as never,
					) as never,
				)
			},
		},
	])
}
