/**
 * Shows a toast on whichever Discord is running.
 *
 * Discord 350204 and newer open a toast with `open(key, { text, icon })`. Older builds, which the Revenge Next plugins
 * were written for, take one object: `open({ key, content, IconComponent })`. The old call on a new Discord hands the
 * whole object over as the key and no toast data at all, so every plugin that shows a toast goes through here.
 */

import { ClientInfoModule } from '@valenced/discord/native'
import type { ComponentType } from 'react'

/** The first Discord build that opens toasts with a key and a payload. */
const KEYED_SINCE = 350204

/** Whether this Discord wants `open(key, payload)`. When the build cannot be read, the newer form is assumed. */
function wantsKeyedOpen(): boolean {
	try {
		const build = Number(ClientInfoModule.getConstants().Build)
		return Number.isFinite(build) ? build >= KEYED_SINCE : true
	} catch {
		return true
	}
}

/** The two ways `ToastActionCreators.open` is called, as far as this file needs them. */
interface ToastOpener {
	open(...args: unknown[]): void
}

/**
 * Opens a toast. Never throws: a toast that cannot be shown is not worth failing over.
 *
 * @param key Names the toast. Opening the same key again replaces the toast that is up.
 * @param text What the toast says.
 * @param icon An icon component to show beside the text.
 * @returns Whether Discord took the toast.
 */
export function openToast(
	key: string,
	text: string,
	icon?: ComponentType<unknown>,
): boolean {
	try {
		const creator = (
			valenced as unknown as {
				discord?: { actions?: { ToastActionCreators?: ToastOpener } }
			}
		).discord?.actions?.ToastActionCreators
		if (typeof creator?.open !== 'function') return false
		if (wantsKeyedOpen()) {
			creator.open(key, icon ? { text, icon } : { text })
		} else {
			creator.open({
				key,
				content: text,
				...(icon ? { IconComponent: icon } : {}),
			})
		}
		return true
	} catch {
		return false
	}
}
