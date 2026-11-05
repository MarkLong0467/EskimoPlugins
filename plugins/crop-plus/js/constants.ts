import type { CropSettings, RadioItem } from './types'

/** The version shown in the settings and the report. Keep it equal to the one in `manifest.json`. */
export const VERSION = '1.3.1'

/** The id of the "crop again" sheet, so it can be closed again. */
export const SHEET_KEY = 'MARKLONG_CROP_PLUS_ASK'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_CROP_PLUS'

/** The error code the cropper uses when the person cancels. Discord treats it as a normal cancel. */
export const CANCELLED = 'E_PICKER_CANCELLED'

/** The shapes the frame can start in. */
export const RATIOS: RadioItem[] = [
	{
		v: 'discord',
		l: 'As Discord does it',
		s: 'The shape of the picture, with free resizing',
	},
	{ v: 'free', l: 'Free', s: 'No starting shape' },
	{ v: '1:1', l: 'Square 1:1', s: 'Emoji, profile pictures' },
	{ v: '4:3', l: '4:3' },
	{ v: '3:2', l: '3:2' },
	{ v: '16:9', l: '16:9' },
	{ v: '9:16', l: '9:16', s: 'Phone screen' },
]

/** The sizes offered for shrinking the result (0 means no limit). */
export const SIDES = [0, 128, 256, 512, 1024, 1600, 2048]

/** The qualities offered, in percent. */
export const QUALITIES = [100, 95, 90, 80, 70, 60]

/** The numbers of crops in a row offered. */
export const PASSES = [2, 3, 4, 6, 10, 15]

/** The sizes offered for where automatic mode stops, in pixels. */
export const TARGETS = [16, 32, 64, 128, 256, 512, 1024]

/** The sizes offered for "only ask when bigger than", in pixels (0 means always). */
export const ASK_ABOVE = [0, 256, 512, 1024, 2048]

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: CropSettings = {
	enabled: true,
	scope: 'attachments',
	again: true,
	mode: 'ask',
	targetPx: 256,
	askAbove: 0,
	maxPasses: 6,
	undoStack: true,
	ratio: 'discord',
	freeStyle: true,
	guidelines: false,
	frame: true,
	rotation: false,
	bottomControls: true,
	maxWidth: 0,
	maxHeight: 0,
	quality: 100,
	cleanTemp: true,
	titles: true,
	tips: true,
}

/** What "Smallest crop" sets: crop again and again, on its own, until the picture is tiny. */
export const SMALLEST: Partial<CropSettings> = {
	enabled: true,
	again: true,
	mode: 'auto',
	targetPx: 32,
	maxPasses: 15,
	scope: 'attachments',
	freeStyle: true,
	ratio: 'free',
	bottomControls: true,
	askAbove: 0,
	maxWidth: 0,
	maxHeight: 0,
	quality: 100,
}

/** How many lines of recent actions are kept. */
export const LOG_SIZE = 12

/** How long to wait for the native cropper screen to be gone before it can open again (milliseconds). */
export const REOPEN_DELAY_MS = 350

/** How long the toast between two automatic crops is read before the cropper opens again (milliseconds). */
export const AUTO_DELAY_MS = 450
