import type { ReactElement } from 'react'
import type { ImageName } from './images'

/** The plugin's settings, stored as JSON. */
export interface ColorfulChannelsSettings {
	/** Show a red NSFW tag next to the names of NSFW channels. */
	nsfwTag: boolean
	/** Color the lock, warning and controller marks on channel icons. */
	colorIcons: boolean
	/** Use fixed yellow, red and green for those marks, instead of the colors of Discord's current theme. */
	colorIconsFallback: boolean
}

/** The extra mark drawn on a channel icon. */
export type GlyphKind = 'Lock' | 'Warning' | 'Controller'

/** How one kind of mark is colored. */
export interface KindStyle {
	/** A fixed color, used when the theme color cannot be found or the fallback colors are chosen. */
	fallback: string
	/** The name of Discord's theme color for this kind of mark. */
	token: string
}

/** One channel icon the plugin knows how to decorate. */
export interface Glyph {
	kind: GlyphKind
	/** True for icons whose empty spot for the mark is at the bottom instead of the top. */
	bottom?: boolean
	/** The plain symbol picture the mark is drawn on. */
	base: ImageName
}

/** The props Discord passes to `BaseChannelIcon`. Only the ones the plugin reads are listed. */
export interface IconProps {
	/** The icon's asset: an asset id, or an object or array that holds one. */
	source?: unknown
	style?: unknown
}

/** The module that draws channel icons. */
export interface ChannelIconModule {
	BaseChannelIcon: (props: IconProps) => ReactElement | null
}

/** The module that draws a channel's name row (`ChannelInfo`). */
export interface ChannelInfoModule {
	default: (props: {
		channel?: { nsfw?: boolean; nsfw_?: boolean }
	}) => ReactElement | null
}
