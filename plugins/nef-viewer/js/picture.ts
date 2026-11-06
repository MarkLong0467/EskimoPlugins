import { PICTURE_FILE_PATTERN, RAW_FILE_PATTERN } from './constants'
import { previewAt } from './convert'
import { readMetadata } from './exif'
import { createRangeReader } from './http'
import { createFileReader } from './reader'
import type { ByteReader } from './reader'
import type { Metadata, PictureFile, ViewerSource } from './types'

/** What was found out about a picture. */
export interface PictureInfo {
	file: PictureFile
	/** The metadata, or `null` if the picture has none. */
	metadata: Metadata | null
	/** The size of the file in bytes, if it could be told. */
	size: number | undefined
}

/** Query parameters Discord's media proxy uses to resize and convert a picture. They are dropped to get the original. */
const PROXY_PARAMS = /([?&])(width|height|format|quality|size)=[^&#]*/g

/** A link without the resizing parameters, so the original file is read (a resized copy has no metadata). */
export function originalLink(url: string): string {
	return url
		.replace(PROXY_PARAMS, '$1')
		.replace(/\?&/, '?')
		.replace(/&&+/g, '&')
		.replace(/[?&]$/, '')
}

/** The file name at the end of a link or path, decoded. */
function nameOf(url: string): string {
	const last = url.split('?')[0]!.split('/').pop() ?? ''
	try {
		return decodeURIComponent(last)
	} catch {
		return last
	}
}

/**
 * Works out which file to read the metadata of for a picture shown in Discord's viewer.
 *
 * A RAW file that this plugin turned into a photo is read from the original RAW file (the photo made from it has none of
 * its metadata). Any other picture is read from its original link.
 *
 * @returns The file, or nothing for videos and for things that are not pictures.
 */
export function pictureFile(
	source: ViewerSource | null | undefined,
): PictureFile | null {
	if (!source || typeof source !== 'object' || source.videoURI) return null
	if (
		typeof source.contentType === 'string' &&
		source.contentType.startsWith('video')
	)
		return null

	const shown = typeof source.uri === 'string' ? source.uri : ''
	const link = [
		source.sourceURI,
		shown,
		source.url,
		source.proxyURL,
		source.proxyUrl,
	].find(value => typeof value === 'string' && value) as string | undefined
	if (!link) return null

	const made = previewAt(shown) ?? previewAt(link)
	if (made?.original)
		return {
			filename: made.filename ?? nameOf(made.original),
			url: made.original,
			local: false,
		}

	const filename = source.filename || nameOf(link)
	const isPicture =
		(typeof source.contentType === 'string' &&
			source.contentType.startsWith('image')) ||
		PICTURE_FILE_PATTERN.test(filename) ||
		RAW_FILE_PATTERN.test(filename)
	if (!isPicture) return null

	const local = /^file:\/\//.test(link) || link.startsWith('/')
	return { filename, url: local ? link : originalLink(link), local }
}

/** A reader for a picture's bytes: from the phone's files or from the server with range requests. */
export function readerFor(file: PictureFile): ByteReader {
	return file.local ? createFileReader(file.url) : createRangeReader(file.url)
}

/** Pictures already read, by link, so opening the same picture again is instant. Only the last few are kept. */
const cache = new Map<string, Promise<PictureInfo>>()
const CACHE_LIMIT = 12

/**
 * Reads what a picture's metadata says.
 *
 * Only the start of the file is downloaded (and, for RAW files, the parts the directories point to), never the whole picture.
 *
 * @throws If the file cannot be read.
 */
export function loadPicture(file: PictureFile): Promise<PictureInfo> {
	const known = cache.get(file.url)
	if (known) return known

	const read = readerFor(file)
	const result = readMetadata(read).then(metadata => ({
		file,
		metadata,
		size: read.size?.() ?? file.size,
	}))
	cache.set(file.url, result)
	if (cache.size > CACHE_LIMIT)
		cache.delete(cache.keys().next().value as string)
	// A picture that failed to read is read again next time.
	result.catch(() => cache.delete(file.url))
	return result
}

/** Forgets the pictures that were read. Used when the plugin stops. */
export function clearPictures(): void {
	cache.clear()
}
