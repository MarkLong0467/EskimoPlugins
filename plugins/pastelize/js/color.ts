/**
 * The colours. A name's colour is worked out from its ID alone: the ID is hashed to a number, the number picks a hue on the
 * colour wheel, and the hue is drawn soft and light (a pastel). The same ID always gives the same colour, on every phone, and
 * the same one the Pastelize plugins for other clients give (they use the same hash, MurmurHash3).
 */

/** A colour as red, green and blue, each 0 to 255. */
export interface Rgb {
	r: number
	g: number
	b: number
}

/** How strong a name's colour is, 0 to 1. */
export const NAME_SATURATION = 0.75
/** How light a name's colour is, 0 to 1. */
export const NAME_LIGHTNESS = 0.6
/** Mentions sit on a tinted background, so they are a little stronger and lighter. */
export const MENTION_SATURATION = 0.85
export const MENTION_LIGHTNESS = 0.75

/** The bytes of a text (UTF-8). */
function bytesOf(text: string): number[] {
	const bytes: number[] = []
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0
		if (code < 0x80) bytes.push(code)
		else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63))
		else if (code < 0x10000)
			bytes.push(
				0xe0 | (code >> 12),
				0x80 | ((code >> 6) & 63),
				0x80 | (code & 63),
			)
		else
			bytes.push(
				0xf0 | (code >> 18),
				0x80 | ((code >> 12) & 63),
				0x80 | ((code >> 6) & 63),
				0x80 | (code & 63),
			)
	}
	return bytes
}

/** Turns the bits of a 32-bit number left. */
const turn = (value: number, by: number): number =>
	(value << by) | (value >>> (32 - by))

/** MurmurHash3 (32 bits, seed 0) of a text: a number from 0 to 4294967295 that looks random but is always the same for a text. */
export function murmur3(text: string): number {
	const bytes = bytesOf(text)
	const blocks = bytes.length - (bytes.length % 4)
	let hash = 0
	for (let i = 0; i < blocks; i += 4) {
		let k =
			bytes[i] |
			(bytes[i + 1] << 8) |
			(bytes[i + 2] << 16) |
			(bytes[i + 3] << 24)
		k = Math.imul(k, 0xcc9e2d51)
		k = turn(k, 15)
		k = Math.imul(k, 0x1b873593)
		hash ^= k
		hash = turn(hash, 13)
		hash = (Math.imul(hash, 5) + 0xe6546b64) | 0
	}
	let k = 0
	const rest = bytes.length % 4
	if (rest === 3) k ^= bytes[blocks + 2] << 16
	if (rest >= 2) k ^= bytes[blocks + 1] << 8
	if (rest >= 1) {
		k ^= bytes[blocks]
		k = Math.imul(k, 0xcc9e2d51)
		k = turn(k, 15)
		k = Math.imul(k, 0x1b873593)
		hash ^= k
	}
	hash ^= bytes.length
	hash ^= hash >>> 16
	hash = Math.imul(hash, 0x85ebca6b)
	hash ^= hash >>> 13
	hash = Math.imul(hash, 0xc2b2ae35)
	hash ^= hash >>> 16
	return hash >>> 0
}

/** A colour from its hue (0 to 360), saturation and lightness (0 to 1). */
export function hsl(hue: number, saturation: number, lightness: number): Rgb {
	const spread = saturation * Math.min(lightness, 1 - lightness)
	const part = (offset: number): number => {
		const k = (offset + hue / 30) % 12
		const value = lightness - spread * Math.max(-1, Math.min(k - 3, 9 - k, 1))
		return Math.round(Math.max(0, Math.min(1, value)) * 255)
	}
	return { r: part(0), g: part(8), b: part(4) }
}

/** The pastel colour of an ID (or of a name). */
export function pastel(
	key: string,
	saturation = NAME_SATURATION,
	lightness = NAME_LIGHTNESS,
): Rgb {
	return hsl(murmur3(key) % 360, saturation, lightness)
}

/** A colour as `#rrggbb`. */
export function toHex({ r, g, b }: Rgb): string {
	return `#${[r, g, b].map(part => part.toString(16).padStart(2, '0')).join('')}`
}

/** A colour as one number without transparency (0xRRGGBB), which is how Discord keeps a role's colour. */
export function toRgbInt({ r, g, b }: Rgb): number {
	return (r << 16) | (g << 8) | b
}

/**
 * A colour as the number Discord's chat takes. The chat is drawn by native code, which wants a colour the way React Native's
 * `processColor` makes it (on Android a signed 32-bit number, 0xAARRGGBB); a `#rrggbb` text is silently ignored there.
 */
export function toNative(color: Rgb, processColor?: unknown): unknown {
	if (typeof processColor === 'function') {
		const made = (processColor as (value: string) => unknown)(toHex(color))
		if (made != null) return made
	}
	return (0xff000000 | toRgbInt(color)) | 0
}
