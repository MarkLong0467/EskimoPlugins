import { kmmiio } from './kmmiio'

const PLUGIN_ID = 'marklong.chatbubbles'

function log(module: string, action: string, found: boolean) {
	kmmiio()?.logUsage?.(PLUGIN_ID, module, action, found)
}

export function isNativeAvailable(): boolean {
	try {
		return typeof valenced?.modules?.native?.callNativeMethod === 'function'
	} catch {
		return false
	}
}

export function hookBubbles() {
	if (!isNativeAvailable()) return Promise.resolve()
	const result = valenced.modules.native.callNativeMethod('bubbles.hook', [])
	log('native', 'bubbles.hook', true)
	return result
}

export function unhookBubbles() {
	if (!isNativeAvailable()) return Promise.resolve()
	const result = valenced.modules.native.callNativeMethod('bubbles.unhook', [])
	log('native', 'bubbles.unhook', true)
	return result
}

/**
 * Push appearance settings to the native side.
 *
 * @param avatarRadius Avatar corner radius in dp.
 * @param bubbleRadius Bubble corner radius in dp.
 * @param bubbleColor A `0xAARRGGBB` int, or `null` to let the native side fall back
 * to its theme default.
 *
 * The color is sent as a decimal string: ARGB ints routinely exceed `Int.MAX_VALUE`
 * (any alpha byte >= 0x80), and if the bridge marshals JS numbers as doubles the
 * native side's `.toInt()` would saturate and corrupt the color.
 */
export function configureBubbles(
	avatarRadius?: number,
	bubbleRadius?: number,
	bubbleColor?: number | null,
) {
	if (!isNativeAvailable()) return Promise.resolve()
	const result = valenced.modules.native.callNativeMethod('bubbles.configure', [
		avatarRadius,
		bubbleRadius,
		bubbleColor == null ? null : bubbleColor.toString(),
	])
	log('native', 'bubbles.configure', true)
	return result
}
