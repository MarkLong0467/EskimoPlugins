import { RAW_FILE_PATTERN } from './constants'
import { previews } from './convert'
import type { Attachment } from './types'

/** Whether an attachment is a Nikon RAW file: a `.nef` or `.nrw` name and a download link. */
export function isRawAttachment(attachment: unknown): attachment is Attachment {
	const candidate = attachment as Partial<Attachment> | null | undefined
	return (
		typeof candidate?.filename === 'string' &&
		RAW_FILE_PATTERN.test(candidate.filename) &&
		typeof candidate.url === 'string'
	)
}

/**
 * Turns a RAW attachment into the photo made from it, so Discord draws an image instead of a file.
 *
 * The file name gets a `.jpg` ending and the link points at the cached JPEG on the phone. The size and dimensions are
 * those of the converted preview, so the image gets the right shape before it has loaded.
 *
 * @returns The attachment unchanged if no preview has been made for it yet.
 */
export function toImageAttachment(attachment: Attachment): Attachment {
	const preview = previews.get(attachment.id)
	if (!preview) return attachment

	return {
		...attachment,
		filename: attachment.filename.replace(RAW_FILE_PATTERN, '.jpg'),
		content_type: 'image/jpeg',
		url: preview.uri,
		proxy_url: preview.uri,
		width: preview.width,
		height: preview.height,
		size: preview.size,
	}
}
