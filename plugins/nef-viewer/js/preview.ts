/**
 * Locates the embedded JPEG preview in a RAW file.
 *
 * Every camera stores a JPEG preview next to the sensor data, and decoding that is far cheaper than developing the RAW
 * data on a phone. Where it is depends on the format:
 *
 * - TIFF-based formats (Nikon NEF and NRW, Canon CR2, Sony ARW, SRF and SR2, Adobe DNG, Olympus ORF, Panasonic RW2, Pentax
 *   PEF, Samsung SRW, Hasselblad 3FR...): in an IFD, found by following the directories.
 * - Fujifilm RAF: the header says where it is.
 * - Anything else (Canon CR3, Sigma X3F, Canon CRW...): the start of the file is searched for JPEGs.
 */

import { findJpegs } from './jpeg'
import { openTiff } from './tiff'
import type { ByteReader } from './reader'

export interface PreviewLocation {
	offset: number
	length: number
	/** EXIF orientation from IFD0, 1 when absent. */
	orientation: number
}

// TIFF tag numbers this file looks at.
const TAG_COMPRESSION = 0x0103
const TAG_ORIENTATION = 0x0112
const TAG_SUB_IFDS = 0x014a
const TAG_JPEG_OFFSET = 0x0201
const TAG_JPEG_LENGTH = 0x0202

/** Most image file directories followed in one file. It stops a damaged file from looping forever. */
const MAX_IFDS = 32

/** How much of the start of a file is searched for JPEGs when it has no directory to follow. */
const SCAN_SIZE = 4 * 1024 * 1024

/** The smallest picture that counts as a preview when searching, so small thumbnails are not chosen. */
const MIN_PREVIEW_SIDE = 400

/** The text a Fujifilm RAF file starts with. */
const RAF_MAGIC = 'FUJIFILMCCD-RAW'

/** Finds the largest JPEG across IFD0, its chain and every SubIFD of a TIFF-based file. `null` if it is not one. */
async function findTiffPreview(
	read: ByteReader,
): Promise<PreviewLocation | null> {
	const opened = await openTiff(read)
	if (!opened) return null
	const { tiff } = opened

	const queue = [opened.ifd0]
	const seen = new Set<number>()
	let best: { offset: number; length: number } | null = null
	let orientation = 1

	while (queue.length && seen.size < MAX_IFDS) {
		const offset = queue.shift()!
		if (!offset || seen.has(offset)) continue
		const isIfd0 = seen.size === 0
		seen.add(offset)

		const ifd = await tiff.ifd(offset)
		if (!ifd) continue
		const { entries, next } = ifd

		if (isIfd0)
			orientation = (await tiff.value(entries.get(TAG_ORIENTATION))) ?? 1

		const subIfds = entries.get(TAG_SUB_IFDS)
		if (subIfds) queue.push(...(await tiff.values(subIfds)))
		if (next) queue.push(next)

		const jpegOffset = await tiff.value(entries.get(TAG_JPEG_OFFSET))
		const jpegLength = await tiff.value(entries.get(TAG_JPEG_LENGTH))
		if (!jpegOffset || !jpegLength) continue

		// Compression 6 is old-style JPEG, 7 is JPEG. Absent tag still allows a JPEG interchange block.
		const compression = await tiff.value(entries.get(TAG_COMPRESSION))
		if (compression !== undefined && compression !== 6 && compression !== 7)
			continue

		if (!best || jpegLength > best.length)
			best = { offset: tiff.base + jpegOffset, length: jpegLength }
	}

	return best && { ...best, orientation }
}

/** Reads the preview of a Fujifilm RAF file: its header holds the offset and length of the JPEG. `null` if it is not one. */
async function findRafPreview(
	read: ByteReader,
): Promise<PreviewLocation | null> {
	const header = await read(0, 92)
	if (header.length < 92) return null
	let magic = ''
	for (let i = 0; i < RAF_MAGIC.length; i++)
		magic += String.fromCharCode(header[i]!)
	if (magic !== RAF_MAGIC) return null

	const u32 = (i: number) =>
		((header[i]! << 24) |
			(header[i + 1]! << 16) |
			(header[i + 2]! << 8) |
			header[i + 3]!) >>>
		0
	const offset = u32(84)
	const length = u32(88)
	// The JPEG carries its own EXIF, so the orientation is already in it.
	return offset && length ? { offset, length, orientation: 1 } : null
}

/** Searches the start of a file for JPEGs and takes the largest one that is big enough to be a preview. */
async function scanForPreview(
	read: ByteReader,
): Promise<PreviewLocation | null> {
	const bytes = await read(0, SCAN_SIZE)
	const jpegs = findJpegs(bytes).filter(
		j => Math.max(j.width, j.height) >= MIN_PREVIEW_SIDE,
	)
	if (!jpegs.length) return null
	const best = jpegs.reduce((a, b) => (b.length > a.length ? b : a))
	return { offset: best.offset, length: best.length, orientation: 1 }
}

/**
 * Finds the embedded JPEG preview of a RAW file, whatever its format.
 *
 * @returns Where the JPEG is and the camera's orientation, or `null` if the file has no usable preview.
 */
export async function findPreview(
	read: ByteReader,
): Promise<PreviewLocation | null> {
	return (
		(await findTiffPreview(read)) ??
		(await findRafPreview(read)) ??
		(await scanForPreview(read))
	)
}
