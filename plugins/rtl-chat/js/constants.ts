import type { RtlSettings } from './types'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_RTL'

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: RtlSettings = {
	mode: 'rtl',
	readable: true,
	forced: false,
}

/** A sideways flip, as a style transform. */
export const FLIP = [{ scaleX: -1 }]

/** An invisible right-to-left mark: starts a paragraph that lines up on the right. */
export const RLM = String.fromCharCode(0x200f)

/** Starts and ends a left-to-right embedding, so English keeps its word order inside a right-to-left paragraph. */
export const LRE = String.fromCharCode(0x202a)
export const PDF = String.fromCharCode(0x202c)

/** The kinds of paragraph that are given the marks. */
export const BLOCKS: Record<string, 1> = { paragraph: 1 }

/** The row type of a message, in the rows Discord hands its native chat. */
export const MESSAGE_ROW = 1

/** The styles offered in the settings. */
export const STYLES = [
	{
		value: 'rtl',
		label: 'Right to left (like Arabic)',
		subLabel:
			'Asks the phone for the layout Discord has in Arabic (profile pictures on the right), and lines message text up on the right. Needs a restart of Discord',
	},
	{
		value: 'text',
		label: 'Right-aligned text only',
		subLabel:
			'Message text lines up on the right. Nothing else moves, no restart needed',
	},
	{
		value: 'mirror',
		label: 'Mirror everything',
		subLabel:
			'The whole app is flipped sideways, like a mirror. Letters in messages are reversed',
	},
	{ value: 'off', label: 'Off', subLabel: 'Normal left to right' },
]
