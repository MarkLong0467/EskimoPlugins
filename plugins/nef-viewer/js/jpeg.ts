/** Whether a segment marker has no length and no data after it. */
const standalone = (marker: number) =>
	marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)

/** Whether a marker is a start-of-frame marker, which holds the picture size. */
const isSof = (marker: number) =>
	marker >= 0xc0 &&
	marker <= 0xcf &&
	marker !== 0xc4 &&
	marker !== 0xc8 &&
	marker !== 0xcc

/** What is known about a JPEG from its headers. */
export interface JpegInfo {
	width: number
	height: number
	/** Whether the JPEG has an EXIF segment. */
	hasExif: boolean
}

/** Reads pixel dimensions from the JPEG's SOF marker, and whether an EXIF APP1 segment exists. */
export function readJpegInfo(jpeg: Uint8Array): JpegInfo | null {
	if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null

	let hasExif = false
	let i = 2
	while (i + 4 <= jpeg.length) {
		if (jpeg[i] !== 0xff) return null
		const marker = jpeg[i + 1]!

		// Fill bytes and standalone markers
		if (marker === 0xff) {
			i++
			continue
		}
		if (standalone(marker)) {
			i += 2
			continue
		}
		if (marker === 0xda || marker === 0xd9) return null

		const segLength = (jpeg[i + 2]! << 8) | jpeg[i + 3]!

		if (
			marker === 0xe1 &&
			jpeg[i + 4] === 0x45 &&
			jpeg[i + 5] === 0x78 &&
			jpeg[i + 6] === 0x69 &&
			jpeg[i + 7] === 0x66
		)
			hasExif = true

		if (isSof(marker) && i + 9 <= jpeg.length) {
			return {
				height: (jpeg[i + 5]! << 8) | jpeg[i + 6]!,
				width: (jpeg[i + 7]! << 8) | jpeg[i + 8]!,
				hasExif,
			}
		}

		i += 2 + segLength
	}

	return null
}

/** Inserts minimal EXIF APP1 segment holding `orientation` right after SOI. */
export function withOrientation(
	jpeg: Uint8Array,
	orientation: number,
): Uint8Array {
	// biome-ignore format: byte layout
	const app1 = [
		0xff, 0xe1, 0x00, 0x22,
		0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
		0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header
		0x00, 0x01, // one entry
		0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation & 0xff, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00, // no next IFD
	]

	const out = new Uint8Array(jpeg.length + app1.length)
	out.set(jpeg.subarray(0, 2), 0)
	out.set(app1, 2)
	out.set(jpeg.subarray(2), 2 + app1.length)
	return out
}

/**
 * Finds where the JPEG that starts at `start` ends.
 *
 * The header segments are skipped by their lengths (a thumbnail inside an EXIF segment is skipped with it), then the
 * picture data is searched for the end marker. Inside the picture data a `ff` byte is always followed by `00` or a restart
 * marker, so the first `ffd9` is the real end.
 *
 * @returns The offset just after the end marker, or `null` if the bytes end first.
 */
function jpegEnd(bytes: Uint8Array, start: number): number | null {
	let i = start + 2
	while (i + 2 <= bytes.length) {
		if (bytes[i] !== 0xff) return null
		const marker = bytes[i + 1]!
		if (marker === 0xff) {
			i++
			continue
		}
		if (standalone(marker)) {
			i += 2
			continue
		}
		if (marker === 0xd9) return i + 2
		if (i + 4 > bytes.length) return null
		const length = (bytes[i + 2]! << 8) | bytes[i + 3]!
		i += 2 + length
		if (marker === 0xda) {
			for (; i + 1 < bytes.length; i++)
				if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return i + 2
			return null
		}
	}
	return null
}

/** A JPEG found inside other bytes. */
export interface FoundJpeg {
	/** Where it starts in the bytes that were searched. */
	offset: number
	length: number
	width: number
	height: number
}

/**
 * Finds every complete JPEG inside some bytes (the start of a RAW file, for formats that have no directory to follow, such as
 * Canon CR3 and Sigma X3F).
 */
export function findJpegs(bytes: Uint8Array): FoundJpeg[] {
	const found: FoundJpeg[] = []
	for (let i = 0; i + 3 < bytes.length; i++) {
		if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff)
			continue
		const end = jpegEnd(bytes, i)
		if (end === null) continue
		const info = readJpegInfo(bytes.subarray(i, end))
		if (info)
			found.push({
				offset: i,
				length: end - i,
				width: info.width,
				height: info.height,
			})
		i = end - 1
	}
	return found
}
