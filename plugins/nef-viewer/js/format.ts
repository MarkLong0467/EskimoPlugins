import type { Metadata } from './types'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
]

/** A file size in the units cameras and phones use: `3.7 MiB`, `540 KiB`. Nothing if the size is not known. */
export function formatSize(bytes: number | undefined): string {
	if (!bytes || bytes <= 0) return ''
	if (bytes >= 1024 * 1024 * 1024)
		return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GiB`
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
	return `${Math.max(1, Math.round(bytes / 1024))} KiB`
}

/** Picture size as `3000 x 4000`, with the megapixels when it is big enough to matter. */
export function formatDimensions(
	width: number | undefined,
	height: number | undefined,
): string {
	if (!width || !height) return ''
	const megapixels = (width * height) / 1_000_000
	return `${width} x ${height}${megapixels >= 1 ? ` • ${megapixels.toFixed(megapixels >= 10 ? 0 : 1)} MP` : ''}`
}

/** Exposure time as a camera shows it: `1/120 s` for short ones, `2 s` or `1.3 s` for long ones. */
export function formatExposure(seconds: number | undefined): string {
	if (!seconds || seconds <= 0) return ''
	if (seconds >= 1)
		return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`
	return `1/${Math.round(1 / seconds)} s`
}

/** The camera's settings on one line: `1/120 s • ƒ/1.8 • 24 mm • ISO 400`. Anything not recorded is left out. */
export function formatSettings(meta: Metadata): string {
	const parts: string[] = []
	const exposure = formatExposure(meta.exposureTime)
	if (exposure) parts.push(exposure)
	if (meta.fNumber)
		parts.push(
			`ƒ/${Number.isInteger(meta.fNumber) ? meta.fNumber : meta.fNumber.toFixed(1)}`,
		)
	if (meta.focalLength) parts.push(`${Math.round(meta.focalLength)} mm`)
	if (meta.iso) parts.push(`ISO ${meta.iso}`)
	if (meta.exposureBias)
		parts.push(
			`${meta.exposureBias > 0 ? '+' : ''}${meta.exposureBias.toFixed(1)} EV`,
		)
	return parts.join(' • ')
}

/** Whether a model name already starts with its maker's name (first word only, so `NIKON CORPORATION` matches `NIKON Z 8`). */
function startsWithMaker(model: string, make: string): boolean {
	const word = make.split(/\s+/)[0]?.toLowerCase()
	return !!word && model.toLowerCase().startsWith(word)
}

/** The camera: its make and model without repeating the make (`samsung Galaxy S23`, `NIKON Z 8`). */
export function formatCamera(meta: Metadata): string {
	const make = (meta.make ?? '').trim()
	const model = (meta.model ?? '').trim()
	if (startsWithMaker(model, make)) return model
	return [make, model].filter(Boolean).join(' ')
}

/** The lens: its model, with the make in front unless the model already has it. */
export function formatLens(meta: Metadata): string {
	const make = (meta.lensMake ?? '').trim()
	const model = (meta.lensModel ?? '').trim()
	if (make && model && model.toLowerCase().startsWith(make.toLowerCase()))
		return model
	return [make, model].filter(Boolean).join(' ')
}

/**
 * The date and time the picture was taken, like `Wed, Nov 4, 2026 • 3:35 PM GMT-06:00`.
 *
 * Cameras write the time of day as it was where the picture was taken, so it is shown as written, not converted. The time
 * zone is added when the camera recorded it.
 *
 * @param value The camera's text, `2026:11:04 15:35:09`.
 * @param offset The camera's time zone text, `-06:00`.
 * @returns The text, or nothing if the date is missing or is not a date.
 */
export function formatDate(value: string | undefined, offset?: string): string {
	const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})/.exec(
		value ?? '',
	)
	if (!match) return ''
	const [year, month, day, hour, minute] = [
		Number(match[1]),
		Number(match[2]),
		Number(match[3]),
		Number(match[4]),
		Number(match[5]),
	]
	if (!year || month < 1 || month > 12 || day < 1 || day > 31) return ''
	const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
	const hour12 = hour % 12 === 0 ? 12 : hour % 12
	const zone = offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? ` GMT${offset}` : ''
	return `${weekday}, ${MONTHS[month - 1]} ${day}, ${year} • ${hour12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}${zone}`
}

/** The place as `44.0704, -92.7326`. */
export function formatCoordinates(latitude: number, longitude: number): string {
	return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
}

/** A link that opens the place in Google Maps (the Maps app on a phone that has it). */
export function googleMapsUrl(latitude: number, longitude: number): string {
	return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`
}

/** One map picture for a place: its address and where in the picture the place is (0 to 1 from the top left). */
export interface MapTile {
	url: string
	x: number
	y: number
}

/**
 * The map picture (an OpenStreetMap tile) that holds a place.
 *
 * @param zoom How close the map is. 15 shows a few streets.
 */
export function mapTile(
	latitude: number,
	longitude: number,
	zoom = 15,
): MapTile {
	const scale = 2 ** zoom
	const x = ((longitude + 180) / 360) * scale
	const radians = (latitude * Math.PI) / 180
	const y =
		((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) *
		scale
	const tileX = Math.floor(x)
	const tileY = Math.floor(y)
	return {
		url: `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`,
		x: x - tileX,
		y: y - tileY,
	}
}
