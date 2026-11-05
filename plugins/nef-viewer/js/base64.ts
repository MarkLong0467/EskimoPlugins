/** The 64 characters base64 uses. */
const ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Encodes bytes as base64. Hermes lacks a guaranteed `btoa` for binary data. */
export function toBase64(bytes: Uint8Array) {
	const parts: string[] = []
	const chunk = 0x8000 * 3

	for (let start = 0; start < bytes.length; start += chunk) {
		const end = Math.min(start + chunk, bytes.length)
		let s = ''
		for (let i = start; i < end; i += 3) {
			const a = bytes[i]!
			const b = i + 1 < end ? bytes[i + 1]! : 0
			const c = i + 2 < end ? bytes[i + 2]! : 0
			const n = (a << 16) | (b << 8) | c
			s += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!
			s += i + 1 < end ? ALPHABET[(n >> 6) & 63]! : '='
			s += i + 2 < end ? ALPHABET[n & 63]! : '='
		}
		parts.push(s)
	}

	return parts.join('')
}
