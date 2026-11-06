import { getKmmiio } from './modules'

/**
 * Discord's close glyph, through the lib's icon resolver, which prefers the
 * generated component and falls back to the void SVG on its own.
 *
 * The Devices page draws this with the 24px `ic_close_24px` asset, which only
 * exists as a metro chunk id, so the same artwork is reached by name instead.
 */
export function getCloseIcon(): any {
	return getKmmiio()?.getIcon?.('CloseIcon')
}

/**
 * `INTERACTIVE_TEXT_DEFAULT` as a hex string, the tint the Devices page gives its
 * close button. The lib resolves the semantic token against the live theme, which
 * an icon `color` prop needs, since the design system only resolves tokens inside
 * its own style pipeline.
 */
export function getCloseIconColor(): string | undefined {
	return getKmmiio()?.resolveColor?.('INTERACTIVE_TEXT_DEFAULT')
}
