/** The plugin's settings, stored as JSON. See `DEFAULT_SETTINGS` in `constants.ts` for what each one does. */
export interface CropSettings {
	/** The main switch. */
	enabled: boolean
	/** `attachments`: only the "Edit image" crop of a chat picture. `everywhere`: every crop. */
	scope: 'attachments' | 'everywhere'
	/** Offer to crop again after each crop. */
	again: boolean
	/** `ask`: a sheet after each crop. `auto`: open the cropper again at once until the picture is small enough. */
	mode: 'ask' | 'auto'
	/** In `auto` mode: stop when the longest side is at most this many pixels. */
	targetPx: number
	/** Only ask when the longest side of the result is bigger than this many pixels (0 means always ask). */
	askAbove: number
	/** The most crops in a row. */
	maxPasses: number
	/** The sheet may go back to the pass before. */
	undoStack: boolean
	/** The starting shape of the frame: `discord` (the picture's own), `free`, or a ratio such as `16:9`. */
	ratio: string
	/** Always let the frame change shape. */
	freeStyle: boolean
	/** The 3x3 grid in the frame. */
	guidelines: boolean
	/** The frame border. */
	frame: boolean
	/** Two-finger rotation. */
	rotation: boolean
	/** Keep the Scale and Rotate tabs. */
	bottomControls: boolean
	/** Shrink the result to at most this wide (0 means do not shrink). */
	maxWidth: number
	/** Shrink the result to at most this tall (0 means do not shrink). */
	maxHeight: number
	/** JPEG quality of the result, in percent. */
	quality: number
	/** Delete the pictures of earlier passes when done. */
	cleanTemp: boolean
	/** The cropper's title says which crop this is and how big the picture is. */
	titles: boolean
	/** A short tip when the first crop of the day opens. */
	tips: boolean
}

/** What the native cropper is given. Discord fills in many fields (colors, texts); only the ones used here are named. */
export interface CropOptions {
	path?: string
	uri?: string
	width?: number
	height?: number
	freeStyleCropEnabled?: boolean
	cropperToolbarTitle?: string
	showCropGuidelines?: boolean
	showCropFrame?: boolean
	enableRotationGesture?: boolean
	hideBottomControls?: boolean
	compressImageMaxWidth?: number
	compressImageMaxHeight?: number
	compressImageQuality?: number
	[field: string]: unknown
}

/** What the native cropper returns for one pass. */
export interface CropResult {
	path: string
	uri?: string
	width?: number
	height?: number
	mime?: string
	size?: number
	cropRect?: unknown
}

/** The module that holds `openCropper`. Its `cleanSingle` deletes a cropped picture. */
export interface CropperHolder {
	openCropper: (options: CropOptions) => Promise<CropResult | null>
	cleanSingle?: (path: string) => unknown
}

/** What the sheet answers: crop again, use the last one, go back one, or cancel it all. */
export type Choice = 'again' | 'done' | 'undo' | 'cancel'

/** A line of the log of recent actions. */
export interface LogEntry {
	at: number
	text: string
	ok: boolean
}

/** What the plugin found in Discord, and what went wrong. Shown in the report. */
export interface Hooks {
	cropper: string
	patched: string[]
	problems: string[]
}

/** Counters shown in the settings and the report. */
export interface Stats {
	crops: number
	passes: number
	extra: number
	shrunk: number
	cancelled: number
	skipped: number
}

/** One line of the self-check. */
export interface Check {
	ok: boolean
	label: string
	detail?: string
}

/** One choice in a list of radio rows. */
export interface RadioItem {
	v: string
	l: string
	s?: string
}
