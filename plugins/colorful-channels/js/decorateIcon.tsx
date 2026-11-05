import { Image, StyleSheet, View } from 'react-native'
import { assetName } from './assets'
import { resolveColor } from './color'
import { setting } from './config'
import { ICON_SIZE, KIND_STYLES } from './constants'
import { glyphFor } from './glyph'
import { IMAGES } from './images'
import type { ReactElement } from 'react'
import type { ImageStyle } from 'react-native'
import type { IconProps } from './types'

/** The picture of the mark (lock, warning or controller) that is drawn on top of the plain symbol. */
function overlayFor(
	kind: 'Lock' | 'Warning' | 'Controller',
	bottom: boolean | undefined,
) {
	if (kind === 'Controller') return IMAGES.controller
	if (kind === 'Lock') return bottom ? IMAGES.lockBottom : IMAGES.lock
	return bottom ? IMAGES.warningBottom : IMAGES.warning
}

/**
 * Replaces the picture of a locked, NSFW or game channel icon with a colored one.
 *
 * Discord draws every channel icon with `BaseChannelIcon`. This runs after it: it finds out from the icon's asset name
 * which icon it was, and if it is one with a lock, warning or controller mark, draws the plain symbol with the mark
 * on top, tinted yellow (lock), red (warning) or green (controller).
 *
 * The icon keeps the color Discord gave it (`color` on Discord's own element) and the style it was given.
 *
 * @param args The arguments `BaseChannelIcon` was called with.
 * @param ret What `BaseChannelIcon` returned.
 * @returns The new element, or `ret` unchanged when the setting is off or the icon is not one of the supported ones.
 */
export function decorateIcon(
	args: [IconProps?],
	ret: ReactElement | null,
): ReactElement | null {
	if (!setting('colorIcons') || !ret?.props) return ret

	const props = args[0] || {}
	const name = assetName(props.source)
	if (!name) return ret
	const glyph = glyphFor(name)
	if (!glyph) return ret

	const kind = KIND_STYLES[glyph.kind]
	const overlay = overlayFor(glyph.kind, glyph.bottom)

	// The element Discord drew may be tinted. Its color token ("interactive-normal") becomes a token name
	// ("INTERACTIVE_NORMAL") so it can be looked up, and the symbol keeps that tint.
	const elementProps = ret.props as { color?: unknown; style?: unknown }
	const iconColor =
		typeof elementProps.color === 'string'
			? elementProps.color.replace(/-/g, '_').toUpperCase()
			: ''
	const iconTint = iconColor ? resolveColor(iconColor) : undefined

	const styled = StyleSheet.flatten([
		props.style,
		elementProps.style,
		{ width: ICON_SIZE, height: ICON_SIZE },
		iconTint ? { tintColor: iconTint } : null,
	] as never) as ImageStyle

	const tint = setting('colorIconsFallback')
		? kind.fallback
		: resolveColor(kind.token) || kind.fallback

	return (
		<View>
			<Image style={styled} source={{ uri: IMAGES[glyph.base] }} />
			<View style={{ position: 'absolute', right: 0, bottom: 0 }}>
				<Image
					style={{ ...styled, tintColor: tint }}
					source={{ uri: overlay }}
				/>
			</View>
		</View>
	)
}
