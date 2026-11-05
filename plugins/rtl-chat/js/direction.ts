import { ToastActionCreators } from '@valenced/discord/actions'
import { BundleUpdaterManager } from '@valenced/discord/native'
import { NativeModules, I18nManager as RNI18nManager } from 'react-native'
import { TOAST_KEY } from './constants'
import { saveSettings, setting } from './state'
import type { I18nManager } from './types'

/** React Native's layout direction manager, if the phone lets an app change the direction. */
function i18n(): I18nManager | null {
	const manager = RNI18nManager as unknown as I18nManager | undefined
	return manager && typeof manager.forceRTL === 'function' ? manager : null
}

/** Whether the app is laid out right to left right now (decided when Discord started). */
export function isRtlNow(): boolean {
	const manager = i18n()
	return !!(manager && manager.isRTL)
}

/**
 * Asks the phone to lay the app out right to left, exactly as Discord looks in Arabic, or to go back to normal.
 *
 * Going back to normal is only done if this plugin turned right to left on earlier (it remembers that in `forced`), so a
 * phone that is right to left for its own reasons is left alone. The phone applies the change when Discord restarts.
 *
 * @param mode The style to apply. If not given, the saved one.
 * @returns A sentence saying what went wrong, or an empty text.
 */
export function applyDirection(mode?: string): string {
	const manager = i18n()
	if (!manager)
		return 'This phone does not let apps change the layout direction'
	const want = (mode || setting('mode')) === 'rtl'
	try {
		if (want) {
			manager.allowRTL?.(true)
			manager.swapLeftAndRightInRTL?.(true)
			manager.forceRTL(true)
			if (!setting('forced')) saveSettings({ forced: true })
		} else if (setting('forced')) {
			// Right to left was turned on by this plugin earlier: give the phone its normal direction back.
			manager.forceRTL(false)
			saveSettings({ forced: false })
		}
	} catch (error) {
		return `Could not change the layout direction: ${String((error as { message?: unknown } | undefined)?.message || error).slice(0, 80)}`
	}
	return ''
}

/** Restarts the app, so a new layout direction applies. If that is not possible, a toast asks to close and open it. */
export function restartApp(): void {
	try {
		const updater = BundleUpdaterManager as unknown as
			| { reload?: () => void }
			| undefined
		if (updater && typeof updater.reload === 'function') {
			updater.reload()
			return
		}
	} catch {
		// Try the next way.
	}
	try {
		const dev = (
			NativeModules as unknown as
				| { DevSettings?: { reload?: () => void } }
				| undefined
		)?.DevSettings
		if (dev && typeof dev.reload === 'function') {
			dev.reload()
			return
		}
	} catch {
		// Ask the person below.
	}
	try {
		ToastActionCreators.open(TOAST_KEY, {
			text: 'Close Discord completely and open it again',
		})
	} catch {
		// Nothing more to try.
	}
}
