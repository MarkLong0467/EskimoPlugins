import { FileModule } from '@valenced/discord/native'

/** Reads `length` bytes at `offset`. May return fewer bytes at end of file. */
export type ByteReader = ((
	offset: number,
	length: number,
) => Promise<Uint8Array>) & {
	/** The size of the whole file in bytes, once it is known (after the first read). */
	size?: () => number | undefined
}

/** The 64 characters base64 uses. */
const ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Where each base64 character sits in the alphabet, so decoding is one lookup per character. */
const LOOKUP = (() => {
	const table = new Int16Array(128).fill(-1)
	for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i
	return table
})()

/** Decodes base64 text to bytes. Characters that are not base64 (line breaks, padding) are skipped. */
export function fromBase64(text: string): Uint8Array {
	const out = new Uint8Array(Math.floor((text.length * 3) / 4))
	let length = 0
	let bits = 0
	let value = 0
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i)
		const digit = code < 128 ? LOOKUP[code] : -1
		if (digit === undefined || digit < 0) continue
		value = (value << 6) | digit
		bits += 6
		if (bits >= 8) {
			bits -= 8
			out[length++] = (value >> bits) & 0xff
		}
	}
	return out.subarray(0, length)
}

/**
 * Creates a reader over a file on the phone, for pictures that were already saved (such as the previews this plugin
 * made). The file is read once, whole, and kept.
 *
 * @param path The file's path, with or without `file://`.
 */
export function createFileReader(path: string): ByteReader {
	let bytes: Uint8Array | undefined
	const read: ByteReader = async (offset, length) => {
		if (!bytes)
			bytes = fromBase64(
				await FileModule.readFile(path.replace(/^file:\/\//, ''), 'base64'),
			)
		return bytes.subarray(offset, Math.min(offset + length, bytes.length))
	}
	read.size = () => bytes?.length
	return read
}
