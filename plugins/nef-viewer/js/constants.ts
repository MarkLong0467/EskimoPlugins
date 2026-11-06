import type { RawViewerSettings } from './types'

/** Prefix for this plugin's console messages. */
export const TAG = '[raw-viewer]'

/**
 * File names the plugin treats as RAW files, in any letter case:
 * Nikon `nef` `nrw`, Canon `cr2` `cr3` `crw`, Sony `arw` `srf` `sr2`, Adobe and many phones `dng`, Olympus `orf`,
 * Panasonic and Leica `rw2` `rwl`, Fujifilm `raf`, Pentax `pef`, Samsung `srw`, Hasselblad `3fr`, Epson `erf`,
 * Kodak `kdc` `dcr`, Minolta `mrw`, Mamiya `mef`, Phase One `iiq`, and Sigma `x3f`.
 */
export const RAW_FILE_PATTERN =
	/\.(nef|nrw|cr2|cr3|crw|arw|srf|sr2|dng|orf|rw2|rwl|raf|pef|srw|3fr|erf|kdc|dcr|mrw|mef|iiq|x3f)$/i

/** File names the picture viewer's info button is shown for: pictures, RAW files and the formats phones save. */
export const PICTURE_FILE_PATTERN =
	/\.(jpe?g|png|webp|heic|heif|avif|tiff?|gif|bmp)$/i

/** Most conversions that run at the same time. Each one downloads part of a large file, so keep it low. */
export const MAX_CONCURRENT = 2

/** The id of the sheet that shows the info, so it can be closed again. */
export const SHEET_KEY = 'marklong.raw-viewer.info'

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: RawViewerSettings = {
	convertRaw: true,
	renderOnDemand: false,
	infoButton: true,
	swipeUp: true,
	mapPreview: true,
}

/** Flux events that carry one message in `payload.message`. */
export const SINGLE_MESSAGE_EVENTS = [
	'MESSAGE_CREATE',
	'MESSAGE_UPDATE',
] as const

/** Flux events that carry a list of messages in `payload.messages`, for a channel, pins or mentions. */
export const MESSAGE_LIST_EVENTS = [
	'LOAD_MESSAGES_SUCCESS',
	'LOAD_MESSAGES_AROUND_SUCCESS',
	'LOAD_PINNED_MESSAGES_SUCCESS',
	'LOAD_RECENT_MENTIONS_SUCCESS',
] as const

/** The text of the message menu row that renders the RAW photos of a message. */
export const RENDER_LABEL = 'Render RAW photo'

/** Icons for that row, tried in order. The first one that exists is used. */
export const RENDER_ICONS = ['ImageIcon', 'ic_image', 'ic_image_24px']

/** The labels of the copy rows. The row goes in the box that holds them. */
export const COPY_LABELS = ['Copy Text', 'Copy Message Link', 'Copy Message ID']

/** How long after the menu is drawn the message it was drawn for can still be used, in milliseconds. */
export const TARGET_MAX_AGE_MS = 5000
