/**
 * Makes an animated GIF from pictures. Valenced's JavaScript has no image tools, so this writes the file by hand: a colour
 * list, then each picture squeezed with LZW (the squeezing GIF uses), then the end mark.
 */

/** The squeezing, with 8 bits per colour. Returns the bytes in the order GIF wants them. */
export function lzw(pixels: Uint8Array): Uint8Array {
	const CLEAR = 256
	const END = 257
	const TABLE = 18013
	const keys = new Int32Array(TABLE).fill(-1)
	const values = new Uint16Array(TABLE)
	const out: number[] = []
	let buffer = 0
	let held = 0
	let bits = 9
	let top = (1 << bits) - 1
	let free = END + 1
	let clearing = false

	const write = (code: number): void => {
		buffer |= code << held
		held += bits
		while (held >= 8) {
			out.push(buffer & 0xff)
			buffer >>>= 8
			held -= 8
		}
		if (free > top || clearing) {
			if (clearing) {
				bits = 9
				top = (1 << bits) - 1
				clearing = false
			} else {
				bits++
				top = bits === 12 ? 4096 : (1 << bits) - 1
			}
		}
	}
	const reset = (): void => {
		keys.fill(-1)
		free = END + 1
		clearing = true
		write(CLEAR)
	}

	write(CLEAR)
	let prefix = pixels[0] ?? 0
	for (let i = 1; i < pixels.length; i++) {
		const next = pixels[i] ?? 0
		const key = (prefix << 8) | next
		let slot = Math.imul(key, 2654435761) >>> 0
		slot %= TABLE
		let found = false
		while (keys[slot] !== -1) {
			if (keys[slot] === key) {
				found = true
				break
			}
			slot = slot + 1 === TABLE ? 0 : slot + 1
		}
		if (found) {
			prefix = values[slot] ?? 0
			continue
		}
		write(prefix)
		if (free < 4096) {
			keys[slot] = key
			values[slot] = free++
		} else {
			reset()
		}
		prefix = next
	}
	write(prefix)
	write(END)
	if (held > 0) out.push(buffer & 0xff)
	return Uint8Array.from(out)
}

/** A picture to put in a GIF. */
export interface GifOptions {
	width: number
	height: number
	/** The 256 colours, 3 bytes each. */
	palette: Uint8Array
	/** The pictures, one byte a pixel (a place in the palette). */
	frames: Uint8Array[]
	/** How long each picture shows, in hundredths of a second. */
	delay: number
	/** The colour that is see-through, or -1 for none. */
	transparent: number
}

/** Makes a GIF that plays over and over. */
export function encodeGif(options: GifOptions): Uint8Array {
	const { width, height, palette, frames, delay, transparent } = options
	const parts: Uint8Array[] = []
	const word = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff]
	const ascii = (text: string): number[] =>
		Array.from(text, c => c.charCodeAt(0))
	parts.push(
		Uint8Array.from([
			...ascii('GIF89a'),
			...word(width),
			...word(height),
			0xf7,
			0,
			0,
		]),
		palette,
		// Play over and over.
		Uint8Array.from([0x21, 0xff, 0x0b, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 0]),
	)
	for (const pixels of frames) {
		// Each picture replaces the one before it, background and all.
		const flags = (2 << 2) | (transparent >= 0 ? 1 : 0)
		parts.push(
			Uint8Array.from([
				0x21,
				0xf9,
				4,
				flags,
				...word(delay),
				Math.max(transparent, 0),
				0,
				0x2c,
				...word(0),
				...word(0),
				...word(width),
				...word(height),
				0,
				8,
			]),
		)
		const data = lzw(pixels)
		for (let at = 0; at < data.length; at += 255) {
			const piece = data.subarray(at, Math.min(at + 255, data.length))
			parts.push(Uint8Array.of(piece.length), piece)
		}
		parts.push(Uint8Array.of(0))
	}
	parts.push(Uint8Array.of(0x3b))
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
	let at = 0
	for (const part of parts) {
		out.set(part, at)
		at += part.length
	}
	return out
}

const ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Bytes as base64 text, which is how Discord's file code takes a file and how a picture can sit in a `data:` address. */
export function toBase64(bytes: Uint8Array): string {
	const pieces: string[] = []
	let text = ''
	for (let i = 0; i < bytes.length; i += 3) {
		const a = bytes[i] ?? 0
		const b = bytes[i + 1] ?? 0
		const c = bytes[i + 2] ?? 0
		text +=
			ALPHABET[a >> 2] +
			ALPHABET[((a & 3) << 4) | (b >> 4)] +
			(i + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '=') +
			(i + 2 < bytes.length ? ALPHABET[c & 63] : '=')
		if (text.length > 8192) {
			pieces.push(text)
			text = ''
		}
	}
	pieces.push(text)
	return pieces.join('')
}
