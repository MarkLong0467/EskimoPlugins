import { Dispatcher } from '@valenced/discord/common/flux'
import { diag } from '../diag'
import {
	configureBubbles,
	hookBubbles,
	isNativeAvailable,
	unhookBubbles,
} from './bubbles'
import { getSettings, getStorage } from './state'
import type { PluginCleanupApi } from '@valenced/plugins/types'

const APPEARANCE_EVENTS = [
	'CACHE_LOADED',
	'SELECTIVELY_SYNCED_USER_SETTINGS_UPDATE',
	'THEME_UPDATE',
]

// Resolve the bubble color: the picked custom color (as an int) when the toggle is on,
// otherwise the theme's BACKGROUND_SECONDARY_ALT so bubbles follow the active theme.
// Falls back to `null` (the native default) whenever no usable color is available.
function getBubbleColor(): number | null {
	const { customBubbleColor, bubbleColor } = getSettings()
	if (customBubbleColor && typeof bubbleColor === 'number') return bubbleColor
	try {
		const tokens = (valenced.discord.common as any).tokens
		const token = tokens.colors.BACKGROUND_SECONDARY_ALT
		const theme = (valenced.discord.flux.Stores as any).ThemeStore?.theme
		const resolved = tokens.internal.resolveSemanticColor(theme, token)
		if (typeof resolved === 'string' && resolved.startsWith('#')) {
			return Number(valenced.react.ReactNative.processColor(resolved))
		}
	} catch {}
	return null
}

function updateBubbleAppearance() {
	const { avatarRadius, bubbleChatRadius } = getSettings()
	configureBubbles(
		Math.round(Number(avatarRadius) || 0),
		Math.round(Number(bubbleChatRadius) || 0),
		getBubbleColor(),
	).catch(e => {
		console.error('[ChatBubbles] bubbles.configure failed:', e)
		diag.fail('native', e)
	})
}

export function startBubbles(cleanup: PluginCleanupApi) {
	let stop = () => {}

	void (async () => {
		// Defer native hook until after initial render to avoid blocking splash
		await new Promise(r => setTimeout(r, 0))

		if (!isNativeAvailable()) {
			diag.check(
				'Native part of kmmiio Library',
				false,
				'The native bridge is missing',
			)
			return
		}

		// Hook the MessageView styling and subscribe to appearance/theme changes.
		// The `bubbles.*` bridge methods are provided by the plugin's native side.
		try {
			await hookBubbles()
			diag.check('Native part of kmmiio Library', true, 'bubbles.hook answered')
		} catch (error) {
			diag.check(
				'Native part of kmmiio Library',
				false,
				'bubbles.hook failed. The library needs its native part (plugin.jar) installed and Discord restarted',
			)
			diag.fail('native', error)
			return
		}

		const subs: Array<() => void> = []

		for (const event of APPEARANCE_EVENTS) {
			Dispatcher.subscribe(event, updateBubbleAppearance)
			subs.push(() => Dispatcher.unsubscribe(event, updateBubbleAppearance))
		}
		subs.push(getStorage()!.subscribe(updateBubbleAppearance))

		stop = () => {
			for (const un of subs) un()
			void unhookBubbles().catch(() => {})
		}

		updateBubbleAppearance()
	})()

	cleanup(() => stop())
}
