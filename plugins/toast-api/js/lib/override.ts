import { toasts } from '../api/api'
import { onImportedPath } from './finders'
import { getSettings } from './settings'
import type { ToastInput, ToastVariant } from '../types'

const TOAST_ACTIONS_PATH = 'modules/toast/native/ToastActionCreators.tsx'

/** Variants a mana toast is allowed to name. */
const VARIANT_NAMES = ['default', 'success', 'critical', 'warning', 'info']

/**
 * Ids this override put on its own stack, oldest first. Discord pops the toast
 * it is currently showing, which is the oldest one, so `close()` takes from the
 * front.
 */
const forwarded: string[] = []

const wrapped = new WeakSet<object>()

const log = (message: string, error?: unknown) => {
	if (error !== undefined) console.warn(`[toast-api] ${message}`, error)
	else console.warn(`[toast-api] ${message}`)
}

function enabled(): boolean {
	try {
		return getSettings().overrideDiscordToasts === true
	} catch {
		return false
	}
}

function liveIds(): Set<string> {
	return new Set(toasts.list().map(entry => entry.id))
}

function pruneForwarded(live: Set<string>): void {
	for (let i = forwarded.length - 1; i >= 0; i--) {
		if (!live.has(forwarded[i])) forwarded.splice(i, 1)
	}
}

/** Put one of Discord's toasts on our stack, dropping ids that have expired. */
function showForwarded(input: ToastInput): void {
	pruneForwarded(liveIds())
	forwarded.push(toasts.show(input))
}

/**
 * Take the toast Discord would pop next: the oldest one this override put on
 * screen that is still up. `undefined` means there is nothing of ours to close.
 */
function takeOldestForwarded(): string | undefined {
	pruneForwarded(liveIds())
	return forwarded.shift()
}

/**
 * `ToastActionCreators.open()` — the shape plugins and Discord pass: a line of
 * text, sometimes a glyph and a colour for it.
 */
function fromOpen(options: any): ToastInput {
	const icon = options?.icon
	const input: ToastInput = {
		content: typeof options?.content === 'string' ? options.content : '',
	}
	if (typeof options?.key === 'string' && options.key.length > 0) {
		input.key = options.key
	}
	const component =
		typeof options?.IconComponent === 'function'
			? options.IconComponent
			: typeof icon === 'function'
				? icon
				: undefined
	if (component != null) input.IconComponent = component
	else if (typeof icon === 'number') input.icon = icon
	if (typeof options?.iconColor === 'string') {
		input.iconColor = options.iconColor
		// Discord tints the glyph it was handed, so ask for the same on an asset.
		if (typeof icon === 'number') input.recolorLegacyIcon = true
	}
	if (options?.containerStyle != null)
		input.containerStyle = options.containerStyle
	return input
}

/**
 * `openMana(key, payload)` — the lower-level entry Discord's own features use,
 * carrying a mana toast literal instead of the options object above.
 */
function fromOpenMana(key: any, payload: any): ToastInput {
	const input: ToastInput = {
		content: typeof payload?.text === 'string' ? payload.text : '',
	}
	if (typeof key === 'string' && key.length > 0) input.key = key
	const variant = payload?.variant
	if (typeof variant === 'string' && VARIANT_NAMES.includes(variant)) {
		input.variant = variant as ToastVariant
	}
	const icon = payload?.icon
	if (typeof icon === 'function') input.IconComponent = icon
	else if (typeof icon === 'number') input.icon = icon
	else if (
		icon != null &&
		typeof icon === 'object' &&
		typeof icon.type === 'string'
	)
		input.iconEntity = icon
	if (typeof payload?.iconColor === 'string')
		input.iconColor = payload.iconColor
	return input
}

/**
 * Swap `open` / `openMana` / `close` on one object for wrappers that come here
 * first. Callers read those properties off the same exported object when they
 * call them, so swapping them is enough — nothing has to be patched deeper.
 *
 * Each wrapper falls through to the original while the setting is off, and again
 * if drawing the toast here throws — never drop a toast over our own failure.
 *
 * Returns whether the object is wrapped after this call — either just now or on
 * an earlier attempt — so the caller can tell success from "not yet".
 */
function wrap(target: any, restorers: Array<() => void>): boolean {
	if (target == null || typeof target !== 'object') return false
	if (wrapped.has(target)) return true
	if (typeof target.open !== 'function' || typeof target.close !== 'function')
		return false

	const originalOpen = target.open
	const originalClose = target.close
	const originalOpenMana =
		typeof target.openMana === 'function' ? target.openMana : undefined

	try {
		target.open = (...args: any[]) => {
			if (!enabled()) return originalOpen.apply(target, args)
			try {
				// Discord 350204+ calls open(key, payload) where older builds called open(options).
				showForwarded(
					typeof args[0] === 'string'
						? fromOpenMana(args[0], args[1])
						: fromOpen(args[0]),
				)
				return undefined
			} catch (error) {
				log('failed to draw an open() toast here', error)
				return originalOpen.apply(target, args)
			}
		}

		target.close = (...args: any[]) => {
			if (!enabled()) return originalClose.apply(target, args)
			try {
				const id = takeOldestForwarded()
				if (id !== undefined) {
					toasts.close(id)
					return undefined
				}
			} catch (error) {
				log('failed to close a forwarded toast', error)
			}
			// Nothing of ours is on screen — let Discord close whatever it still has.
			return originalClose.apply(target, args)
		}

		if (originalOpenMana != null) {
			target.openMana = (...args: any[]) => {
				if (!enabled()) return originalOpenMana.apply(target, args)
				try {
					showForwarded(fromOpenMana(args[0], args[1]))
					return undefined
				} catch (error) {
					log('failed to draw an openMana() toast here', error)
					return originalOpenMana.apply(target, args)
				}
			}
		}
	} catch (error) {
		log('failed to wrap ToastActionCreators', error)
		return false
	}

	wrapped.add(target)
	restorers.push(() => {
		target.open = originalOpen
		target.close = originalClose
		if (originalOpenMana != null) target.openMana = originalOpenMana
		wrapped.delete(target)
	})
	return true
}

/**
 * Route Discord's toasts through this layer while the setting is on.
 *
 * The target is the module's default export: the object Discord's own files
 * import and the one `valenced.discord.actions` resolves to. One object, one
 * wrap. The finder callback fires once, either immediately or when the module
 * initializes, so that single subscription is the whole install path.
 */
export function installToastOverride(): () => void {
	const restorers: Array<() => void> = []
	let stopped = false
	let announced = false

	const attempt = (ns: any): void => {
		if (stopped) return
		if (wrap(ns?.default, restorers)) {
			if (!announced) {
				announced = true
				console.log('[toast-api] ToastActionCreators overridden')
			}
			return
		}
		log('could not reach ToastActionCreators yet')
	}

	const unsubscribe = onImportedPath(TOAST_ACTIONS_PATH, attempt)

	return () => {
		stopped = true
		try {
			unsubscribe?.()
		} catch {
			// ignore
		}
		for (const restore of restorers.splice(0)) {
			try {
				restore()
			} catch (error) {
				log('failed to restore ToastActionCreators', error)
			}
		}
		forwarded.length = 0
	}
}
