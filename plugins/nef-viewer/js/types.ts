/**
 * Shapes of the Discord objects this plugin reads and rewrites, and of what it finds in pictures.
 *
 * Discord's messages and attachments carry many more fields. Only the ones the plugin uses are listed, and the index
 * signatures let every other field pass through untouched.
 */

/** A file attached to a message. */
export interface Attachment {
	id: string
	filename: string
	url: string
	proxy_url?: string
	content_type?: string
	width?: number
	height?: number
	size?: number
	[field: string]: unknown
}

/** A message, as it arrives in Flux events and as it is kept in the message store. */
export interface DiscordMessage {
	id?: string
	channel_id?: string
	attachments?: Attachment[]
	/** Forwarded messages: the original message is inside a snapshot. */
	message_snapshots?: Array<{ message?: DiscordMessage } | undefined>
}

/** The part of Discord's `MessageStore` this plugin uses. */
export interface MessageStore {
	getMessage?(channelId: string, messageId: string): DiscordMessage | undefined
}

/** The plugin's settings, stored as JSON. See `DEFAULT_SETTINGS` in `constants.ts` for what each one does. */
export interface RawViewerSettings {
	/** Show RAW files as photos. */
	convertRaw: boolean
	/** Do not render RAW files until asked: hold the message and tap Render RAW photo. */
	renderOnDemand: boolean
	/** The info button in the picture viewer. */
	infoButton: boolean
	/** The handle at the bottom of the picture viewer that opens the info when swiped up. */
	swipeUp: boolean
	/** Show a map in the info when the picture has a place. It loads one map picture from OpenStreetMap. */
	mapPreview: boolean
}

/**
 * The picture that Discord's viewer shows. Discord's own object has more fields; these are the ones used.
 * `sourceURI` is the original file's link, `uri` the picture as drawn (resized, or a converted preview on the phone).
 */
export interface ViewerSource {
	uri?: string
	sourceURI?: string | null
	filename?: string
	width?: number | null
	height?: number | null
	contentType?: string | null
	videoURI?: string | null
	[field: string]: unknown
}

/** What is known about a picture from its metadata. Every field is missing if the picture does not say. */
export interface Metadata {
	make?: string
	model?: string
	software?: string
	artist?: string
	copyright?: string
	lensMake?: string
	lensModel?: string
	/** The EXIF orientation, 1 to 8. */
	orientation?: number
	/** When the picture was last changed, as the camera wrote it: `2026:11:04 15:35:09`. */
	date?: string
	/** When the picture was taken, as the camera wrote it. */
	dateOriginal?: string
	/** The time zone the picture was taken in, such as `-06:00`. */
	offsetOriginal?: string
	width?: number
	height?: number
	/** Exposure time in seconds. */
	exposureTime?: number
	fNumber?: number
	iso?: number
	/** Focal length in millimeters. */
	focalLength?: number
	/** Focal length as on a 35 mm film camera. */
	focalLength35?: number
	/** Exposure compensation in stops. */
	exposureBias?: number
	flash?: boolean
	latitude?: number
	longitude?: number
	/** Meters above sea level. */
	altitude?: number
}

/** Where the bytes of a viewed picture come from. */
export interface PictureFile {
	/** The file name to show. */
	filename: string
	/** The link or path the bytes are read from. */
	url: string
	/** Whether the file is on the phone rather than on a server. */
	local: boolean
	/** The size in bytes, if Discord told it. */
	size?: number
}
