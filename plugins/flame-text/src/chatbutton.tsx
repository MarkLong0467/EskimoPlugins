/**
 * An optional flame button in the chat box, next to the emoji button. Tap it to turn flame text on or off. The fire is grey
 * while it is off and turns orange when it is on.
 *
 * It is a normal chat box button: Discord's own `ChatInputActionButton`, the component the emoji and gift buttons are made of,
 * put into the row that `ChatInputRightActions` draws, just before the emoji button. Nothing is wrapped around Discord's
 * buttons and no extra row is added. Plugins that hide, read or merge the chat box buttons (Better Chat Buttons, Chat Buttons
 * by mlemception) work on `ChatInputActionButton` itself and its `accessibilityLabel`, `IconComponent`, `onPress` and
 * `accessibilityState`, so they see the flame button like any other: Chat Buttons lists it in its menu as "Flame text" with a
 * switch for on and off.
 *
 * `ChatInputRightActions` is wrapped only while the setting is on. The wrapper changes the list of buttons the component
 * returns and never calls a React hook. It is not made with Valenced's patcher (see `wrap`), so it does not take part in the
 * hooks other plugins add to that component.
 */

import {
	getModuleWithImportedPath,
	lookupModuleWithImportedPath,
} from '@valenced/discord/utils/modules/finders'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { after } from '@valenced/patcher'
import { findInReactFiber } from '@valenced/utils/react'
import { createElement, useEffect, useState, useSyncExternalStore } from 'react'
import { Text as NativeText } from 'react-native'
import { diag } from './diag'
import { state } from './state'
import { setting, store } from './store'
import { switchFlame } from './toggle'
import type { ComponentType, ReactElement, ReactNode } from 'react'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** Where Discord keeps the two components, by the path of the file that defines them. */
const RIGHT_ACTIONS_PATH =
	'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx'
const ACTION_BUTTON_PATH =
	'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx'

/** The key of the button in the list, so it is found again and never added twice. */
const BUTTON_KEY = 'flame-text'

/** The colour of the fire while flame text is on. */
const ORANGE = '#ff6a00'

/** The flame, as a constant because React Native text must be passed as an expression. */
const FLAME = '\u{1F525}'
const LABEL = 'Flame text'

/** The names Discord's fire icon may have, the first one that exists is used. */
const FIRE_ICONS = ['FireIcon', 'FlameIcon', 'ActivityIcon'] as const

/** What the chat box gives an icon: a style (with the tint) and a size. */
interface IconProps {
	style?: unknown
	size?: string
}

/** The props of Discord's chat box button, as far as this file uses them. */
interface ActionButtonProps {
	accessibilityLabel: string
	accessibilityState?: { checked?: boolean }
	/** Discord's own "this button is on" state: the icon gets `activeIconStyle` while it is true. */
	active?: boolean
	activeIconStyle?: { tintColor: string }
	IconComponent: ComponentType<IconProps>
	onPress: () => void
}

/** The module that holds Discord's chat box button. */
interface ActionButtonModule {
	default?: ComponentType<ActionButtonProps>
}

/** The module that holds the chat box's right-hand buttons. */
interface RightActionsModule {
	default?: object
}

/** A node of the tree the right-hand buttons return: the row has its buttons as `children`. */
interface RowNode {
	props: { children: ReactNode[] }
}

/** Discord's fire icon, or nothing if Discord has none by the names tried. */
function fireIcon(): ComponentType<IconProps> | undefined {
	for (const name of FIRE_ICONS) {
		try {
			const found = lookupGeneratedIconComponent(name)
			if (found) return found as unknown as ComponentType<IconProps>
		} catch {
			// Try the next one.
		}
	}
	return undefined
}

/** Whether a style (or a list of styles) has this tint. */
function tintOf(style: unknown): string | undefined {
	if (Array.isArray(style)) {
		let found: string | undefined
		for (const part of style) found = tintOf(part) ?? found
		return found
	}
	const tint = (style as { tintColor?: unknown } | null | undefined)?.tintColor
	return typeof tint === 'string' ? tint : undefined
}

/**
 * The picture on the button: Discord's fire icon, grey like the other buttons while flame text is off and orange while it is
 * on. The chat box draws it with its own grey tint in `style`; going on adds the orange tint after it. It redraws itself when
 * flame text is switched, because the list of buttons is not drawn again for that.
 */
export function FlameIcon(props: IconProps) {
	const enabled = useSyncExternalStore(subscribe, enabledNow)
	const on = useSyncExternalStore(subscribe, onNow)
	if (!enabled) return null
	const Fire = fireIcon()
	if (Fire) {
		const style = on ? [props.style, { tintColor: ORANGE }] : props.style
		return createElement(Fire, { ...props, style })
	}
	// Discord has no fire icon: the emoji stands in for it, dimmed while it is off.
	const lit = tintOf(props.style) === ORANGE || on
	return (
		<NativeText style={{ fontSize: 22, opacity: lit ? 1 : 0.45 }}>
			{FLAME}
		</NativeText>
	)
}

/**
 * How the button reads the settings. `useSyncExternalStore` always draws what is stored now: it checks again after it
 * has subscribed, so a change made while the button was being drawn is not missed, and every part that shows the state
 * changes in the same pass.
 */
const subscribe = (notify: () => void): (() => void) => store.subscribe(notify)
const onNow = (): boolean => !!setting('on')
const enabledNow = (): boolean => !!setting('chatButton')

/** Two presses closer than this are one: a button that reports a press twice would switch flame text on and straight off. */
const DOUBLE_PRESS_MS = 200

/** When the button was last pressed. */
let lastPress = 0

/** What tapping the button does. */
function tap(): void {
	try {
		const now = Date.now()
		if (now - lastPress < DOUBLE_PRESS_MS) {
			state.chatDoubled++
			return
		}
		lastPress = now
		state.chatTaps++
		const next = !setting('on')
		switchFlame(next)
		// The stored state is what messages are sent by, so it must now be what was asked for.
		if (!!setting('on') !== next) {
			diag.log(
				'flame button',
				'The switch did not hold; setting it again',
				'warn',
			)
			switchFlame(next, true)
		}
	} catch (error) {
		diag.fail('flame button', error)
	}
}

/** The orange icon Discord's button uses while it is on. */
const ACTIVE_ICON = { tintColor: ORANGE }

/** Discord's chat box button component, once its module has been loaded. It is looked for again until it is found. */
let foundButton: ComponentType<ActionButtonProps> | undefined

/** Discord's chat box button component, if its module has been loaded. */
function actionButton(): ComponentType<ActionButtonProps> | undefined {
	if (foundButton) return foundButton
	try {
		const found =
			lookupModuleWithImportedPath<ActionButtonModule>(ACTION_BUTTON_PATH)[0]
		foundButton = found?.default
	} catch {
		foundButton = undefined
	}
	return foundButton
}

/**
 * The button itself: Discord's `ChatInputActionButton`, drawn with the label, the icon, what tapping does and whether flame
 * text is on (as `accessibilityState.checked`, which is where plugins that list the chat box buttons read an on/off state).
 *
 * The slot redraws itself when flame text is switched, so the button's state is always current, also in a menu that a plugin
 * such as Chat Buttons builds from the buttons it finds. The label never changes (it is the button's name for those
 * plugins), and the button is drawn by Discord's own component, so every plugin that changes or reads that component sees it.
 */
export function FlameSlot() {
	const enabled = useSyncExternalStore(subscribe, enabledNow)
	const on = useSyncExternalStore(subscribe, onNow)
	// Discord's button module may not be loaded the first time the row is drawn; look again once it is (as other chat box button plugins do).
	const [late, setButton] = useState<ComponentType<ActionButtonProps> | undefined>()
	const Button = actionButton() ?? late
	useEffect(() => {
		if (Button || !enabled) return
		return getModuleWithImportedPath<ActionButtonModule>(
			ACTION_BUTTON_PATH,
			exports => {
				foundButton = exports?.default
				if (foundButton) setButton(() => foundButton)
			},
		)
	}, [Button, enabled])
	if (!enabled || !Button) return null
	state.chatShown = on
	state.chatSlots++
	// The state is given in every way Discord's button and the plugins that read it understand: `checked` for plugins that
	// list the buttons with a switch, and `active` with its icon style for Discord's own "on" look.
	return createElement(Button, {
		accessibilityLabel: LABEL,
		accessibilityState: { checked: on },
		active: on,
		activeIconStyle: ACTIVE_ICON,
		IconComponent: FlameIcon,
		onPress: tap,
	})
}

/** The slot as it goes in the list: the same element every draw, so React keeps it and cached trees can find it. */
const SLOT = createElement(FlameSlot, { key: BUTTON_KEY })

/** Whether a list item is this plugin's button. */
const isOurs = (child: ReactNode): boolean =>
	!!child &&
	typeof child === 'object' &&
	(child as ReactElement).key === BUTTON_KEY

/**
 * Puts the button into the list of buttons the right-hand actions returned, just before the emoji button (the last one), or
 * takes it out when the setting is off. The tree can be one that was kept from an earlier draw, so an old copy is removed first.
 */
function placeButton(tree: unknown): unknown {
	try {
		state.chatCalls++
		const row = findInReactFiber(
			tree as ReactElement,
			(node): node is RowNode =>
				Array.isArray(
					(node as { props?: { children?: unknown } }).props?.children,
				),
		) as RowNode | undefined
		if (!row) {
			state.chatNoRow++
			return tree
		}
		const list = row.props.children
		for (let i = list.length - 1; i >= 0; i--)
			if (isOurs(list[i])) list.splice(i, 1)
		if (!setting('chatButton')) return tree
		const at = Math.max(0, list.length - 1)
		list.splice(at, 0, SLOT)
		state.chatDrawn++
	} catch (error) {
		diag.fail('flame button', error)
	}
	return tree
}

/**
 * The priority of the patch. Valenced runs the hooks with the highest priority first, so the button is already in the row when
 * a plugin that hides, reads or merges the chat box buttons looks at it, whichever plugin started first.
 */
const FIRST = 500

/**
 * Adds the flame button to the chat box while the setting is on.
 *
 * The right-hand actions are wrapped when the setting is switched on and the wrapper is taken out when it is switched off, so a
 * phone that does not use the button is not touched at all.
 *
 * @param cleanup Where to register what undoes it.
 */
export function installChatButton(cleanup: Cleanup): void {
	const undo: Array<() => unknown> = []

	const stop = () => {
		for (const fn of undo.splice(0)) {
			try {
				fn()
			} catch {
				// Already gone.
			}
		}
	}

	const start = () => {
		if (undo.length > 0) return
		state.chatWatched = true
		try {
			undo.push(
				getModuleWithImportedPath<RightActionsModule>(
					RIGHT_ACTIONS_PATH,
					exports => {
						const Right = exports?.default as { type: unknown } | undefined
						if (!Right || (typeof Right !== 'object' && typeof Right !== 'function')) return
						state.chatSeen = true
						diag.log('found', 'Found the chat box buttons')
						// The same patch the other chat box button plugins make, which is the one that works on every phone.
						undo.push(
							after(Right as never, 'type' as never, placeButton as never, {
								priority: FIRST,
							}) as never,
						)
					},
				),
			)
		} catch (error) {
			// Without the finder the button cannot be added, and the rest of the plugin is not affected.
			state.chatWatched = false
			diag.fail('flame button', error)
		}
	}

	const sync = () => {
		if (setting('chatButton')) start()
		else if (undo.length > 0) {
			stop()
			state.chatWatched = false
		}
	}

	sync()
	cleanup(store.subscribe(sync), () => {
		stop()
		foundButton = undefined
	})
}
