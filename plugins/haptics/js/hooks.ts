import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { NativeModules, Vibration } from 'react-native'
import { setting } from './config'
import { changed, hooks, note, saw } from './state'
import { attempt, shortArgs } from './util'
import type { Cleanup, Holder } from './types'

/**
 * Long-press menus. Discord opens them with `ActionSheetActionCreators.openLazy`, which takes an option that skips the
 * buzz (`disableHapticOnOpen`). With the switch off the option is added. With it on the call is left as it is.
 *
 * @returns Whether the menu opener was found and patched.
 */
export function hookMenus(cleanup: Cleanup): boolean {
	const creators = ActionSheetActionCreators as unknown as
		| { openLazy?: (...args: unknown[]) => unknown }
		| undefined
	if (!creators || typeof creators.openLazy !== 'function') return false

	cleanup(
		instead(
			creators as { openLazy: (...args: unknown[]) => unknown },
			'openLazy',
			function (args, original) {
				try {
					if (!setting('menus')) {
						args[2] = Object.assign({}, args[2], { disableHapticOnOpen: true })
						saw('Menu opened', 'buzz removed')
					} else saw('Menu opened', 'buzz kept')
				} catch {
					// Never let logging get in the way of opening the menu.
				}
				return Reflect.apply(original, this, args)
			},
		),
	)
	hooks.menus = 'working'
	note('Menu hook: working')
	return true
}

/**
 * Patches one haptic function that Discord's code calls. Every call is logged. With "Other haptic feedback" off the call
 * is swallowed: functions whose name ends in `Async` give back a resolved promise (callers wait for them), the others
 * give back nothing.
 *
 * @returns Whether `holder` has a function with that name.
 */
function hookFunction(
	cleanup: Cleanup,
	holder: Holder | null | undefined,
	name: string,
	label: string,
): boolean {
	if (!holder || typeof holder[name] !== 'function') return false

	cleanup(
		instead(
			holder as Record<string, (...args: unknown[]) => unknown>,
			name,
			function (args, original) {
				const off = !setting('discord')
				saw(
					`${label}.${name}(${shortArgs(args)})`,
					off ? 'swallowed' : 'allowed',
				)
				if (off) return /Async$/.test(name) ? Promise.resolve() : undefined
				return Reflect.apply(original, this, args)
			},
		),
	)
	return true
}

/**
 * The haptic libraries Discord's code may use, found by what they export:
 * - `impactAsync`, `notificationAsync` and `selectionAsync` (expo-haptics style),
 * - `trigger` together with `HapticFeedbackTypes` (react-native-haptic-feedback style),
 * - the native modules `RNHapticFeedback` and `ExpoHaptics`, looked up by exact name only.
 *
 * Libraries are found with `getModules`, so one that loads later is hooked when it does. What was hooked is shown on
 * the settings screen.
 */
export function hookLibraries(cleanup: Cleanup): void {
	const found: string[] = []
	const add = (label: string) => {
		found.push(label)
		hooks.libraries = found.join(', ')
		note(`Haptic library hooked: ${label}`)
		changed()
	}

	cleanup(
		getModules(
			withProps('impactAsync', 'notificationAsync', 'selectionAsync'),
			module => {
				attempt('hooking the haptics library', () => {
					const exported = module as unknown as Holder & { default?: Holder }
					const holder =
						exported && typeof exported.impactAsync === 'function'
							? exported
							: exported?.default
					let any = false
					for (const name of [
						'impactAsync',
						'notificationAsync',
						'selectionAsync',
					]) {
						if (hookFunction(cleanup, holder, name, 'haptics')) any = true
					}
					if (any) add('haptics (impact, notification, selection)')
				})
			},
		),
	)

	cleanup(
		getModules(withProps('trigger', 'HapticFeedbackTypes'), module => {
			attempt('hooking the haptic feedback library', () => {
				const exported = module as unknown as Holder & { default?: Holder }
				let any = hookFunction(cleanup, exported, 'trigger', 'hapticFeedback')
				if (
					exported?.default &&
					exported.default !== exported &&
					hookFunction(cleanup, exported.default, 'trigger', 'hapticFeedback')
				) {
					any = true
				}
				if (any) add('haptic feedback (trigger)')
			})
		}),
	)

	// Native modules, looked up by exact name only (their members are never listed).
	attempt('looking for native haptics', () => {
		const natives = ((NativeModules as unknown) || {}) as Record<
			string,
			Holder | undefined
		>
		const wanted: Array<[string, string[]]> = [
			['RNHapticFeedback', ['trigger']],
			['ExpoHaptics', ['impactAsync', 'notificationAsync', 'selectionAsync']],
		]
		for (const [moduleName, names] of wanted) {
			const native = natives[moduleName]
			if (!native) continue
			let any = false
			for (const name of names) {
				if (hookFunction(cleanup, native, name, moduleName)) any = true
			}
			if (any) add(moduleName)
		}
	})
}

/**
 * Plain vibrations, from React Native's own `Vibration.vibrate`. With "Vibrations" off the call is swallowed.
 *
 * @returns Whether `Vibration.vibrate` was found and patched.
 */
export function hookVibration(cleanup: Cleanup): boolean {
	const vibration = Vibration as unknown as
		| { vibrate?: (...args: unknown[]) => unknown }
		| undefined
	if (!vibration || typeof vibration.vibrate !== 'function') return false

	cleanup(
		instead(
			vibration as { vibrate: (...args: unknown[]) => unknown },
			'vibrate',
			function (args, original) {
				const off = !setting('vibration')
				saw('Vibration', off ? 'swallowed' : 'allowed')
				if (off) return undefined
				return Reflect.apply(original, this, args)
			},
		),
	)
	hooks.vibration = 'working'
	note('Vibration hook: working')
	return true
}
