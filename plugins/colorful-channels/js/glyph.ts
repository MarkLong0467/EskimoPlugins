import { GLYPHS } from './constants'
import type { Glyph, GlyphKind } from './types'

/**
 * Works out which glyph an icon is from its name, so it keeps working when Discord spells the name differently
 * (`TextLockIcon`, `ic_channel_text_locked`, `channel-text-lock`...).
 *
 * The name is reduced to lowercase letters, a trailing `icon` is dropped, and two questions are asked of it:
 * 1. what is the mark: lock, warning (or NSFW) or controller (or game)?
 * 2. what type of channel is it: announcements, forum, stage, image, voice or text?
 *
 * @returns The glyph, or nothing if the name is not one of the supported channel icons.
 */
export function glyphFor(name: string): Glyph | undefined {
	const n = String(name)
		.toLowerCase()
		.replace(/[^a-z]/g, '')
		.replace(/icon$/, '')

	const kind: GlyphKind | null = /lock/.test(n)
		? 'Lock'
		: /warning|nsfw/.test(n)
			? 'Warning'
			: /controller|gamepad|game/.test(n)
				? 'Controller'
				: null
	if (!kind) return undefined

	const type = /announcement|news/.test(n)
		? 'Announcements'
		: /forum/.test(n)
			? 'Forum'
			: /stage/.test(n)
				? 'Stage'
				: /image|media|photo/.test(n)
					? 'Image'
					: /voice|audio|speaker/.test(n)
						? 'Voice'
						: /text|channel/.test(n)
							? 'Text'
							: null
	return type ? GLYPHS[type + kind] : undefined
}
