import type {
	ColorfulChannelsSettings,
	Glyph,
	GlyphKind,
	KindStyle,
} from './types'

/** What the settings are before anything is saved: tags and colors on, with the theme's own colors. */
export const DEFAULT_SETTINGS: ColorfulChannelsSettings = {
	nsfwTag: true,
	colorIcons: true,
	colorIconsFallback: false,
}

/**
 * The color of each kind of mark. `token` is the name of Discord's theme color (so the mark follows the theme),
 * `fallback` is the plain color used if that cannot be found, or when the fallback colors are chosen in the settings.
 */
export const KIND_STYLES: Record<GlyphKind, KindStyle> = {
	Lock: { fallback: '#f0b232', token: 'STATUS_WARNING' },
	Warning: { fallback: '#f23f43', token: 'STATUS_DANGER' },
	Controller: { fallback: '#23a55a', token: 'STATUS_POSITIVE' },
}

/**
 * Every channel icon that gets a colored mark, by channel type plus mark (`TextLock`, `VoiceWarning`, ...).
 * Each is a plain symbol picture (`base`) with the mark drawn over its empty spot.
 */
export const GLYPHS: Record<string, Glyph> = {
	AnnouncementsLock: { kind: 'Lock', base: 'announcementLock' },
	AnnouncementsWarning: { kind: 'Warning', base: 'announcementWarning' },
	TextLock: { kind: 'Lock', base: 'textLock' },
	TextWarning: { kind: 'Warning', base: 'textWarning' },
	TextController: { kind: 'Controller', base: 'textController' },
	VoiceLock: { kind: 'Lock', base: 'voiceLock' },
	VoiceWarning: { kind: 'Warning', base: 'voiceWarning' },
	ForumLock: { kind: 'Lock', base: 'forumLock' },
	ForumWarning: { kind: 'Warning', base: 'forumWarning' },
	StageLock: { kind: 'Lock', bottom: true, base: 'stageLock' },
	ImageLock: { kind: 'Lock', bottom: true, base: 'imageLock' },
	ImageWarning: { kind: 'Warning', bottom: true, base: 'imageWarning' },
}

/** The red of the NSFW tag. */
export const NSFW_COLOR = '#f23f43'

/** The size, in points, the icons are drawn at. */
export const ICON_SIZE = 18
