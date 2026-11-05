import { store } from './discord'
import type { PreviewAttachment } from './types'

/** A file waiting in the message box, as Discord's upload store keeps it. */
interface Upload {
	uniqueId: string
	filename: string
	spoiler: boolean
	isImage: boolean
	getSize(): Promise<number>
	item: { mimeType: string; uri: string; width?: number; height?: number }
}

/** The part of Discord's upload store that the plugin uses. */
interface UploadStore {
	getUploads(channelId: string, draftType: number): Upload[]
}

/** How many files are waiting to be sent in a channel. */
export function countUploads(channelId: string): number {
	const uploads = store<UploadStore>('UploadAttachmentStore')
	return uploads?.getUploads ? uploads.getUploads(channelId, 0).length : 0
}

/**
 * What you have picked to upload, written the way a sent message lists its attachments, so the preview shows them.
 *
 * @returns The attachments, or an empty list if there are none or the upload store could not be read.
 */
export async function getAttachments(
	channelId: string,
): Promise<PreviewAttachment[]> {
	try {
		const uploads =
			store<UploadStore>('UploadAttachmentStore')?.getUploads(channelId, 0) ??
			[]
		return await Promise.all(
			uploads.map(async upload => {
				const item = upload.item
				const attachment: PreviewAttachment = {
					id: upload.uniqueId,
					filename: upload.spoiler
						? `SPOILER_${upload.filename}`
						: upload.filename,
					content_type: item.mimeType,
					size: await upload.getSize(),
					spoiler: upload.spoiler,
					url: `${item.uri}#`,
					proxy_url: `${item.uri}#`,
				}
				if (upload.isImage) {
					attachment.width = item.width
					attachment.height = item.height
				}
				return attachment
			}),
		)
	} catch {
		return []
	}
}
