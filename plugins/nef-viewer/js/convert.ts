/**
 * Turns a RAW file into a photo the phone can show, and remembers the result.
 *
 * `convert` downloads the embedded JPEG preview of one RAW file and writes it to Discord's cache folder. Every
 * finished preview is kept in `previews`, and an index of them is saved to disk, so a photo converted once is
 * available straight away the next time Discord starts (`loadIndex`).
 */

import { FileModule } from '@valenced/discord/native'
import { toBase64 } from './base64'
import { createRangeReader } from './http'
import { readJpegInfo, withOrientation } from './jpeg'
import { findPreview } from './preview'

/** Folder inside Discord's cache directory where the previews are written. */
const CACHE_DIR = 'nef-viewer'

/** The saved index of finished previews, relative to the cache directory. */
const INDEX_PATH = `${CACHE_DIR}/index.json`

export interface ConvertedPreview {
	/** `file://` URI of cached JPEG. */
	uri: string
	width: number
	height: number
	size: number
	/** The link of the RAW file it was made from, so its metadata can be read later. Missing in older saves. */
	original?: string
	/** The RAW file name. */
	filename?: string
}

/** Converted previews keyed by attachment ID. */
export const previews = new Map<string, ConvertedPreview>()

/** The absolute path of a file in the cache directory. */
function cachePath(relative: string) {
	return `${FileModule.getConstants().CacheDirPath}/${relative}`
}

/** Loads cached previews from disk, dropping entries with missing files. */
export async function loadIndex() {
	let index: Record<string, ConvertedPreview> = {}
	try {
		index = JSON.parse(await FileModule.readFile(cachePath(INDEX_PATH), 'utf8'))
	} catch {
		return
	}

	await Promise.all(
		Object.entries(index).map(async ([id, preview]) => {
			const exists = await FileModule.fileExists(
				preview.uri.replace(/^file:\/\//, ''),
			).catch(() => false)
			if (exists) previews.set(id, preview)
		}),
	)
}

/** The save that is in progress. Saves are chained so two never write the index at the same time. */
let saving: Promise<unknown> = Promise.resolve()

/** Writes the index of finished previews to disk. A failed save is ignored: the previews are simply rebuilt later. */
function saveIndex() {
	const data = JSON.stringify(Object.fromEntries(previews))
	saving = saving
		.then(() => FileModule.writeFile('cache', INDEX_PATH, data, 'utf8'))
		.catch(() => {})
}

/**
 * Downloads the embedded JPEG preview of a RAW file and caches it on disk.
 *
 * Steps: find the preview inside the RAW file, download only those bytes, check that they are a JPEG, add an EXIF
 * orientation if the preview has none, write the file, and remember it.
 *
 * @param id The attachment id. It names the cached file.
 * @param url The download link of the RAW file.
 * @param filename The RAW file name, kept with the preview.
 * @throws If the file has no embedded JPEG, or the bytes are not a valid JPEG.
 */
export async function convert(id: string, url: string, filename?: string) {
	const read = createRangeReader(url)

	const location = await findPreview(read)
	if (!location) throw new Error('No embedded JPEG preview found')

	let jpeg = await read(location.offset, location.length)
	const info = readJpegInfo(jpeg)
	if (!info) throw new Error('Embedded preview is not a valid JPEG')

	// The camera's orientation is stored in the RAW file, not in the preview. Without an EXIF block in the preview the
	// photo would show sideways, so a minimal one is added.
	const { orientation } = location
	if (orientation > 1 && orientation <= 8 && !info.hasExif)
		jpeg = withOrientation(jpeg, orientation)

	// Orientations 5 to 8 rotate by 90 degrees
	const rotated = orientation >= 5 && orientation <= 8

	const path = await FileModule.writeFile(
		'cache',
		`${CACHE_DIR}/${id}.jpg`,
		toBase64(jpeg),
		'base64',
	)

	const preview: ConvertedPreview = {
		uri: path.startsWith('file://') ? path : `file://${path}`,
		width: rotated ? info.height : info.width,
		height: rotated ? info.width : info.height,
		size: jpeg.length,
		original: url,
		filename,
	}

	previews.set(id, preview)
	saveIndex()
	return preview
}

/** The preview that is saved at a path or link on the phone, if the plugin made one. Used to find the RAW file behind a picture. */
export function previewAt(uri: string): ConvertedPreview | undefined {
	for (const preview of previews.values())
		if (preview.uri === uri) return preview
	return undefined
}
