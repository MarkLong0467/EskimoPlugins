/**
 * Reading the metadata of a picture (EXIF).
 *
 * The metadata is a small TIFF structure. Where it sits depends on the kind of file:
 * - a RAW or TIFF file *is* a TIFF structure, so it starts at the beginning,
 * - a JPEG keeps it in an APP1 segment ("Exif"),
 * - a PNG keeps it in an `eXIf` chunk, a WebP in an `EXIF` chunk,
 * - HEIC, AVIF and CR3 keep it somewhere inside; there it is found by searching for the marker.
 */

import { openTiff } from './tiff'
import type { ByteReader } from './reader'
import type { IfdEntry, TiffReader } from './tiff'
import type { Metadata } from './types'

// Tags in IFD0.
const TAG_WIDTH = 0x0100
const TAG_HEIGHT = 0x0101
const TAG_MAKE = 0x010f
const TAG_MODEL = 0x0110
const TAG_ORIENTATION = 0x0112
const TAG_SOFTWARE = 0x0131
const TAG_DATE_TIME = 0x0132
const TAG_ARTIST = 0x013b
const TAG_COPYRIGHT = 0x8298
const TAG_EXIF_IFD = 0x8769
const TAG_GPS_IFD = 0x8825

// Tags in the EXIF IFD.
const TAG_EXPOSURE_TIME = 0x829a
const TAG_F_NUMBER = 0x829d
const TAG_ISO = 0x8827
const TAG_DATE_ORIGINAL = 0x9003
const TAG_OFFSET_ORIGINAL = 0x9011
const TAG_EXPOSURE_BIAS = 0x9204
const TAG_FLASH = 0x9209
const TAG_FOCAL_LENGTH = 0x920a
const TAG_PIXEL_WIDTH = 0xa002
const TAG_PIXEL_HEIGHT = 0xa003
const TAG_FOCAL_35 = 0xa405
const TAG_LENS_MAKE = 0xa433
const TAG_LENS_MODEL = 0xa434

// Tags in the GPS IFD.
const GPS_LAT_REF = 0x0001
const GPS_LAT = 0x0002
const GPS_LON_REF = 0x0003
const GPS_LON = 0x0004
const GPS_ALT_REF = 0x0005
const GPS_ALT = 0x0006

/** How much of the start of a file is searched for the EXIF marker when the format does not say where it is. */
const SEARCH_SIZE = 512 * 1024

/** Most segments or chunks looked through when searching a JPEG or PNG for its metadata. */
const MAX_PARTS = 64

/** The bytes as text (one character per byte). */
function text(bytes: Uint8Array, start: number, length: number): string {
	let out = ''
	for (let i = start; i < start + length && i < bytes.length; i++)
		out += String.fromCharCode(bytes[i]!)
	return out
}

/** Whether the bytes at `i` are the start of a TIFF header (`II*\0` or `MM\0*`). */
function isTiffHeader(bytes: Uint8Array, i: number): boolean {
	return (
		(bytes[i] === 0x49 &&
			bytes[i + 1] === 0x49 &&
			bytes[i + 2] === 0x2a &&
			bytes[i + 3] === 0) ||
		(bytes[i] === 0x4d &&
			bytes[i + 1] === 0x4d &&
			bytes[i + 2] === 0 &&
			bytes[i + 3] === 0x2a)
	)
}

/** Finds the EXIF block of a JPEG: the APP1 segment that starts with `Exif`. Returns where its TIFF header starts. */
async function findInJpeg(read: ByteReader): Promise<number | null> {
	let i = 2
	for (let n = 0; n < MAX_PARTS; n++) {
		const head = await read(i, 12)
		if (head.length < 4 || head[0] !== 0xff) return null
		const marker = head[1]!
		if (marker === 0xda || marker === 0xd9) return null
		if (marker === 0xff) {
			i++
			continue
		}
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			i += 2
			continue
		}
		const length = (head[2]! << 8) | head[3]!
		if (marker === 0xe1 && text(head, 4, 4) === 'Exif') return i + 10
		i += 2 + length
	}
	return null
}

/** Finds the EXIF block of a PNG (`eXIf` chunk) or WebP (`EXIF` chunk). Returns where its TIFF header starts. */
async function findInChunks(
	read: ByteReader,
	kind: 'png' | 'webp',
): Promise<number | null> {
	let i = kind === 'png' ? 8 : 12
	for (let n = 0; n < MAX_PARTS; n++) {
		const head = await read(i, 8)
		if (head.length < 8) return null
		const size =
			kind === 'png'
				? ((head[0]! << 24) | (head[1]! << 16) | (head[2]! << 8) | head[3]!) >>>
					0
				: (head[4]! | (head[5]! << 8) | (head[6]! << 16) | (head[7]! << 24)) >>>
					0
		const name = kind === 'png' ? text(head, 4, 4) : text(head, 0, 4)
		const data = i + 8
		if (
			(kind === 'png' && name === 'eXIf') ||
			(kind === 'webp' && name === 'EXIF')
		) {
			const start = await read(data, 6)
			return text(start, 0, 4) === 'Exif' ? data + 6 : data
		}
		if (kind === 'png' && name === 'IEND') return null
		i = data + size + (kind === 'png' ? 4 : size % 2)
	}
	return null
}

/** Searches the start of a file for `Exif` followed by a TIFF header, or for a TIFF header alone. */
async function searchForExif(read: ByteReader): Promise<number | null> {
	const bytes = await read(0, SEARCH_SIZE)
	for (let i = 0; i + 10 < bytes.length; i++) {
		if (
			bytes[i] === 0x45 &&
			bytes[i + 1] === 0x78 &&
			bytes[i + 2] === 0x69 &&
			bytes[i + 3] === 0x66 &&
			bytes[i + 4] === 0 &&
			bytes[i + 5] === 0 &&
			isTiffHeader(bytes, i + 6)
		)
			return i + 6
	}
	for (let i = 0; i + 8 < bytes.length; i++)
		if (isTiffHeader(bytes, i) && bytes[i + 4] === 8) return i
	return null
}

/** Works out where the TIFF structure with the metadata starts, whatever the kind of file. */
async function findExifStart(read: ByteReader): Promise<number | null> {
	const head = await read(0, 16)
	if (head.length < 8) return null
	// A RAW or TIFF file is the TIFF structure itself (some RAW formats use their own number in the header, so openTiff decides).
	if (
		(text(head, 0, 2) === 'II' || text(head, 0, 2) === 'MM') &&
		(await openTiff(read, 0))
	)
		return 0
	if (head[0] === 0xff && head[1] === 0xd8) return findInJpeg(read)
	if (head[0] === 0x89 && text(head, 1, 3) === 'PNG')
		return findInChunks(read, 'png')
	if (text(head, 0, 4) === 'RIFF' && text(head, 8, 4) === 'WEBP')
		return findInChunks(read, 'webp')
	return searchForExif(read)
}

/** Turns degrees, minutes and seconds into degrees. */
function degrees(parts: number[]): number | undefined {
	if (parts.length < 3) return undefined
	return parts[0]! + parts[1]! / 60 + parts[2]! / 3600
}

/** A positive number or nothing: a zero or a bad fraction is "not recorded". */
const positive = (value: number | undefined): number | undefined =>
	value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined

/**
 * Reads the metadata of a picture: the camera, the lens, the settings, the date and, if it was recorded, the place.
 *
 * @param read Reads bytes of the file.
 * @returns What was found (possibly nothing but empty fields), or `null` if the file has no metadata block at all.
 */
export async function readMetadata(read: ByteReader): Promise<Metadata | null> {
	const start = await findExifStart(read)
	if (start === null) return null
	const opened = await openTiff(read, start)
	if (!opened) return null
	const { tiff } = opened

	const ifd0 = await tiff.ifd(opened.ifd0)
	if (!ifd0) return null
	const meta: Metadata = {}
	const entries = ifd0.entries

	meta.make = await tiff.ascii(entries.get(TAG_MAKE))
	meta.model = await tiff.ascii(entries.get(TAG_MODEL))
	meta.software = await tiff.ascii(entries.get(TAG_SOFTWARE))
	meta.artist = await tiff.ascii(entries.get(TAG_ARTIST))
	meta.copyright = await tiff.ascii(entries.get(TAG_COPYRIGHT))
	meta.orientation = await tiff.value(entries.get(TAG_ORIENTATION))
	meta.date = await tiff.ascii(entries.get(TAG_DATE_TIME))
	meta.width = await tiff.value(entries.get(TAG_WIDTH))
	meta.height = await tiff.value(entries.get(TAG_HEIGHT))

	const exifPointer = await tiff.value(entries.get(TAG_EXIF_IFD))
	if (exifPointer) await readExifIfd(tiff, exifPointer, meta)

	const gpsPointer = await tiff.value(entries.get(TAG_GPS_IFD))
	if (gpsPointer) await readGpsIfd(tiff, gpsPointer, meta)

	return meta
}

/** Reads the camera settings from the EXIF IFD. */
async function readExifIfd(
	tiff: TiffReader,
	offset: number,
	meta: Metadata,
): Promise<void> {
	const ifd = await tiff.ifd(offset)
	if (!ifd) return
	const e = ifd.entries
	const rational = async (entry: IfdEntry | undefined) =>
		(await tiff.rationals(entry, 1))[0]

	meta.exposureTime = positive(await rational(e.get(TAG_EXPOSURE_TIME)))
	meta.fNumber = positive(await rational(e.get(TAG_F_NUMBER)))
	meta.iso = positive(await tiff.value(e.get(TAG_ISO)))
	meta.dateOriginal = await tiff.ascii(e.get(TAG_DATE_ORIGINAL))
	meta.offsetOriginal = await tiff.ascii(e.get(TAG_OFFSET_ORIGINAL))
	meta.exposureBias = await rational(e.get(TAG_EXPOSURE_BIAS))
	const flash = await tiff.value(e.get(TAG_FLASH))
	if (flash !== undefined) meta.flash = (flash & 1) === 1
	meta.focalLength = positive(await rational(e.get(TAG_FOCAL_LENGTH)))
	meta.focalLength35 = positive(await tiff.value(e.get(TAG_FOCAL_35)))
	meta.lensMake = await tiff.ascii(e.get(TAG_LENS_MAKE))
	meta.lensModel = await tiff.ascii(e.get(TAG_LENS_MODEL))
	meta.width = (await tiff.value(e.get(TAG_PIXEL_WIDTH))) ?? meta.width
	meta.height = (await tiff.value(e.get(TAG_PIXEL_HEIGHT))) ?? meta.height
}

/** Reads the place (latitude, longitude, altitude) from the GPS IFD. */
async function readGpsIfd(
	tiff: TiffReader,
	offset: number,
	meta: Metadata,
): Promise<void> {
	const ifd = await tiff.ifd(offset)
	if (!ifd) return
	const e = ifd.entries

	const lat = degrees(await tiff.rationals(e.get(GPS_LAT)))
	const lon = degrees(await tiff.rationals(e.get(GPS_LON)))
	const latRef = await tiff.ascii(e.get(GPS_LAT_REF))
	const lonRef = await tiff.ascii(e.get(GPS_LON_REF))
	if (
		lat !== undefined &&
		lon !== undefined &&
		Number.isFinite(lat) &&
		Number.isFinite(lon) &&
		(lat !== 0 || lon !== 0)
	) {
		meta.latitude = latRef === 'S' ? -lat : lat
		meta.longitude = lonRef === 'W' ? -lon : lon
	}

	const altitude = (await tiff.rationals(e.get(GPS_ALT), 1))[0]
	if (altitude !== undefined && Number.isFinite(altitude)) {
		const below = (await tiff.value(e.get(GPS_ALT_REF))) === 1
		meta.altitude = below ? -altitude : altitude
	}
}
