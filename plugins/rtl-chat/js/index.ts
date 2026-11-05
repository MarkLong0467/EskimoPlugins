/**
 * RTL Chat.
 *
 * Reads Discord from right to left, in English:
 *   Right to left (default): asks the phone to lay the app out right to left, exactly as Discord looks in Arabic: profile
 *     pictures on the right, text lined up on the right. Discord draws its messages natively, so this is the only way to
 *     move them. It applies after a restart of Discord.
 *   Mirror everything: the whole app is flipped sideways (optionally with readable letters).
 *   Off: normal.
 *
 * How it is put together:
 * - `direction.ts` asks the phone for the layout direction and restarts the app,
 * - `align.ts` lines up message text on the right, by marking the rows that go to the native chat,
 * - `mirror.tsx` flips the whole app (it tries several places to find the root of the app),
 * - `Settings.tsx` is the settings screen, `state.ts`, `constants.ts` and `types.ts` are helpers.
 */

import { Image, Text, TextInput } from 'react-native'
import { installRowAlignment } from './align'
import { DEFAULT_SETTINGS } from './constants'
import { applyDirection } from './direction'
import {
	counterFlip,
	registryInfo,
	restoreApps,
	wrapContainer,
	wrapNavigation,
	wrapRegistry,
	wrapRenderApplication,
	wrapRootElement,
} from './mirror'
import Settings from './Settings'
import { clearListeners, hooked, setStorage } from './state'
import type { RtlSettings } from './types'

export default plugin<{ jsonStorage: RtlSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		/** Runs one step; if it fails the reason is kept for the settings screen and the other steps still run. */
		const attempt = (label: string, step: () => void) => {
			try {
				step()
			} catch (error) {
				hooked[label] =
					`failed: ${String((error as { message?: unknown } | undefined)?.message || error).slice(0, 60)}`
			}
		}

		hooked.direction = applyDirection()
		attempt('rows', () => installRowAlignment(cleanup))

		// Mirror everything: its hooks are always installed, and only flip anything when that style is chosen.
		const tried: string[] = []
		const message = (error: unknown) =>
			String(
				(error as { message?: unknown } | undefined)?.message || error,
			).slice(0, 60)
		const roots: Array<[string, () => string | false]> = [
			[
				'the app root',
				() => wrapRegistry() && `the app root (${hooked.keys.join(', ')})`,
			],
			[
				'renderApplication',
				() =>
					wrapRenderApplication(cleanup) && "React Native's renderApplication",
			],
		]
		for (const [name, step] of roots) {
			if (hooked.how && hooked.how !== 'not hooked yet') break
			try {
				const result = step()
				if (result) hooked.how = result
				else tried.push(`${name}: not found`)
			} catch (error) {
				tried.push(`${name}: ${message(error)}`)
			}
		}
		if (hooked.how === 'not hooked yet') {
			const installed: string[] = []
			const waiting: Array<[string, () => boolean]> = [
				['root element', () => wrapRootElement(cleanup)],
				['navigation', () => wrapNavigation(cleanup)],
				['app container', () => wrapContainer(cleanup)],
			]
			for (const [name, step] of waiting) {
				try {
					if (step()) installed.push(name)
					else tried.push(`${name}: not found`)
				} catch (error) {
					tried.push(`${name}: ${message(error)}`)
				}
			}
			hooked.how = installed.length
				? `waiting on: ${installed.join(', ')}`
				: `nothing found (${tried.join('; ')})`
		}
		hooked.registry = registryInfo()
		attempt('image', () => {
			hooked.image = counterFlip(Image, false, cleanup)
		})
		attempt('text', () => {
			counterFlip(Text, true, cleanup)
		})
		attempt('input', () => {
			hooked.input = counterFlip(TextInput, true, cleanup)
		})

		cleanup(() => {
			restoreApps()
			clearListeners()
		})
	},
})
