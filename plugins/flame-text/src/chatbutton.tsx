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
import { createElement, useSyncExternalStore } from 'react'
import { Text as NativeText, View } from 'react-native'
import { diag } from './diag'
import { currentChat, plainOnly } from './send'
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

/**
 * The priority of the fallback patch. Valenced runs the hooks with the highest priority first, so the button is already in the
 * row when a plugin that hides, reads or merges the chat box buttons looks at it.
 */
const FIRST = 500

/** How often, and how many times, to check that the wrapper was called once a chat is open. */
const CHECK_MS = 2000
const CHECKS = 150

/** The key of the button in the list, so it is found again and never added twice. */
const BUTTON_KEY = 'flame-text'

/** The colour of the fire while flame text is on. */
const ORANGE = '#ff6a00'

/** The flame, as a constant because React Native text must be passed as an expression. */
const FLAME = '\u{1F525}'

/** Drawn over the flame in the chat where flame text is not allowed. */
const NOT_HERE = '\u{1F6AB}'
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

/**
 * The picture on the button in the chat where flame text is not allowed: the same grey fire as when it is off, with a 🚫 over
 * it. It is never orange there.
 */
export function BarredFlameIcon(props: IconProps) {
	const enabled = useSyncExternalStore(subscribe, enabledNow)
	if (!enabled) return null
	const Fire = fireIcon()
	return (
		<View style={{ alignItems: 'center', justifyContent: 'center' }}>
			{Fire ? (
				createElement(Fire, props)
			) : (
				<NativeText style={{ fontSize: 22, opacity: 0.45 }}>{FLAME}</NativeText>
			)}
			<NativeText style={{ position: 'absolute', fontSize: 20 }}>
				{NOT_HERE}
			</NativeText>
		</View>
	)
}

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
export function FlameSlot({ channelId }: { channelId?: string }) {
	const enabled = useSyncExternalStore(subscribe, enabledNow)
	const allowed = useSyncExternalStore(subscribe, onNow)
	if (!enabled) return null
	const Button = actionButton()
	if (!Button) return null
	// In the chat where flame text is not allowed the button is never on, and tapping it does nothing.
	const barred = plainOnly(channelId)
	const on = allowed && !barred
	state.chatShown = on
	// The state is given in every way Discord's button and the plugins that read it understand: `checked` for plugins that
	// list the buttons with a switch, and `active` with its icon style for Discord's own "on" look.
	return createElement(Button, {
		accessibilityLabel: LABEL,
		accessibilityState: { checked: on },
		active: on,
		activeIconStyle: ACTIVE_ICON,
		IconComponent: barred ? BarredFlameIcon : FlameIcon,
		onPress: barred ? nothing : tap,
	})
}

/** What tapping the button does in the chat where flame text is not allowed. */
const nothing = (): void => {}

/** The slots as they go in the list, one for each chat: the same element every draw, so React keeps it. */
const slots = new Map<string, ReactElement>()

/** The element to put in the list for a chat. */
function slotFor(channelId: string | undefined): ReactElement {
	const key = channelId ?? ''
	let slot = slots.get(key)
	if (!slot) {
		if (slots.size >= 40) slots.clear()
		slot = createElement(FlameSlot, { key: BUTTON_KEY, channelId })
		slots.set(key, slot)
	}
	return slot
}

/** Whether a list item is this plugin's button. */
const isOurs = (child: ReactNode): boolean =>
	!!child &&
	typeof child === 'object' &&
	(child as ReactElement).key === BUTTON_KEY

/**
 * Puts the button into the list of buttons the right-hand actions returned, just before the emoji button (the last one), or
 * takes it out when the setting is off. The tree can be one that was kept from an earlier draw, so an old copy is removed first.
 */
function placeButton(tree: unknown, props: unknown): unknown {
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
		// The row is drawn for a chat: it is in the props, and the open chat is the answer if it is not.
		const channel = (props as { channel?: { id?: unknown } } | undefined)
			?.channel
		const id = typeof channel?.id === 'string' ? channel.id : currentChat()
		list.splice(at, 0, slotFor(id))
		state.chatDrawn++
	} catch (error) {
		diag.fail('flame button', error)
	}
	return tree
}

/** What is put in the place of the right-hand actions' function while the button is on. */
interface Wrapped {
	/** The memo object Discord exports, whose `type` is the function that draws the buttons. */
	memo: { type: unknown }
	/** The function that was there before. */
	original: (...args: unknown[]) => unknown
	/** The function that was put there. */
	wrapper: (...args: unknown[]) => unknown
	/** Whether the wrapper adds the button. It stays in place, doing nothing, if another plugin patched over it. */
	active: boolean
	/** The memo put in the module's `default` in place of Discord's, if that worked. */
	fresh?: object
	/** The module the memo was found in, so Discord's memo can be put back. */
	exports?: RightActionsModule
}

/** The wrapper that is in place now, if any. */
let wrapped: Wrapped | undefined

/**
 * Puts the flame button into what the right-hand actions draw.
 *
 * This is a plain function put in place of `type`, not a hook on Valenced's patcher, on purpose. A patch made with the patcher
 * becomes one shared proxy that every plugin's hooks are added to, and the chat box's buttons were drawn through that proxy
 * from then on. A plugin that later adds a hook of its own that calls a React hook (Better Chat Buttons does) then changes the
 * hooks of every button row that was drawn through the proxy, and React stops with "Should have a queue. You are likely calling
 * Hooks conditionally". A plain wrapper has no hooks to add to and calls no React hook, so what other plugins patch later is
 * theirs alone. The wrapper has the same `length` and `displayName` as the function it wraps, because plugins find the
 * component by them.
 */
function wrap(memo: { type: unknown }, exports?: RightActionsModule): void {
	const original = memo.type
	if (typeof original !== 'function') return
	const own = original as (...args: unknown[]) => unknown
	const entry: Wrapped = {
		memo,
		original: own,
		wrapper: undefined as never,
		active: true,
		exports,
	}
	// One named parameter, so `length` is 1 like Discord's function.
	const wrapper = function (this: unknown, props: unknown, ...rest: unknown[]) {
		const result = own.call(this, props, ...rest)
		return entry.active ? placeButton(result, props) : result
	}
	try {
		const named = own as unknown as { displayName?: string; name?: string }
		if (named.displayName) {
			;(wrapper as unknown as { displayName?: string }).displayName =
				named.displayName
		}
		Object.defineProperty(wrapper, 'name', {
			value: named.name ?? 'ChatInputRightActions',
		})
	} catch {
		// The name is only for readability.
	}
	entry.wrapper = wrapper
	const how: string[] = []
	try {
		memo.type = wrapper
		how.push(memo.type === wrapper ? 'type replaced' : 'type kept by Discord')
	} catch {
		how.push('type is read-only')
	}
	// A row that is already on screen keeps the function it was first drawn with. Giving the module a fresh memo of the
	// wrapper makes the parent draw a new kind of element, so the row is drawn again from the start, with the button.
	if (exports) {
		try {
			const fresh = { ...(memo as object), type: wrapper }
			exports.default = fresh
			how.push(
				exports.default === fresh
					? 'module export replaced'
					: 'module export kept by Discord',
			)
			entry.fresh = fresh
		} catch {
			how.push('module export is read-only')
		}
	}
	state.chatHow = how.join(', ')
	wrapped = entry
}

/** Takes the wrapper out. If another plugin has patched over it, it stays in place and does nothing. */
function unwrap(): void {
	const entry = wrapped
	if (!entry) return
	entry.active = false
	if (entry.memo.type === entry.wrapper) {
		entry.memo.type = entry.original
		wrapped = undefined
	}
	try {
		if (entry.exports && entry.fresh && entry.exports.default === entry.fresh)
			entry.exports.default = entry.memo
	} catch {
		// Left as it is; the wrapper does nothing while it is switched off.
	}
}

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
		unwrap()
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
						if (!Right || typeof Right !== 'object') return
						state.chatSeen = true
						diag.log('found', 'Found the chat box buttons')
						if (wrapped?.active && wrapped.memo === Right) return
						if (wrapped?.active && wrapped.fresh === Right) return
						if (
							wrapped &&
							!wrapped.active &&
							wrapped.memo === Right &&
							Right.type === wrapped.wrapper
						) {
							// Still in place from before: switch it on again.
							wrapped.active = true
							return
						}
						wrap(Right, exports)
						// On some phones Discord draws the row without going through the wrapper (the row is never drawn by it). If the wrapper has still
						// not been called after a few seconds, the button is added through Valenced's patcher, which does work there.
						let tries = 0
						const check = setInterval(() => {
							tries++
							if (state.chatCalls > 0 || tries > CHECKS || !setting('chatButton')) {
								clearInterval(check)
								return
							}
							if (tries < 2) return
							clearInterval(check)
							try {
								undo.push(
									after(Right as never, 'type' as never, placeButton as never, {
										priority: FIRST,
									}) as never,
								)
								state.chatHow += ', then through the patcher (the wrapper was not called)'
							} catch (error) {
								diag.fail('flame button', error)
							}
						}, CHECK_MS)
						undo.push(() => clearInterval(check))
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
		else if (undo.length > 0 || wrapped?.active) {
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
