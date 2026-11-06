export type Rgb = [number, number, number]

/** D65 white point in the same units as the XYZ matrix below. */
const WHITE: Rgb = [0.95047, 1, 1.08883]

export function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value
}

export function normaliseHex(input: string, fallback: string): string {
	const body = input.trim().replace(/^#/, '')
	const full = body.length === 3 ? [...body].map(c => c + c).join('') : body
	if (!/^[0-9a-f]{6}$/i.test(full)) return fallback
	return `#${full.toLowerCase()}`
}

export function hexToRgb(hex: string): Rgb {
	const body = normaliseHex(hex, '#000000').slice(1)
	return [
		Number.parseInt(body.slice(0, 2), 16),
		Number.parseInt(body.slice(2, 4), 16),
		Number.parseInt(body.slice(4, 6), 16),
	]
}

/** Discord's raw colours carry their own alpha as an eighth hex digit. */
export interface ParsedHex {
	rgb: Rgb
	alpha: number
}

export function parseHex8(input: string): ParsedHex | undefined {
	const body = input.trim().replace(/^#/, '')
	if (!/^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(body)) return undefined
	return {
		rgb: [
			Number.parseInt(body.slice(0, 2), 16),
			Number.parseInt(body.slice(2, 4), 16),
			Number.parseInt(body.slice(4, 6), 16),
		],
		alpha: body.length === 8 ? Number.parseInt(body.slice(6, 8), 16) / 255 : 1,
	}
}

/** Lay a translucent colour over an opaque one, the way the compositor would. */
export function composite(fg: Rgb, alpha: number, bg: Rgb): Rgb {
	return [
		fg[0] * alpha + bg[0] * (1 - alpha),
		fg[1] * alpha + bg[1] * (1 - alpha),
		fg[2] * alpha + bg[2] * (1 - alpha),
	]
}

export function withAlpha(hex: string, alpha: number): string {
	const body = normaliseHex(hex, '#000000').slice(1)
	const part = Math.round(clamp(alpha, 0, 1) * 255)
		.toString(16)
		.padStart(2, '0')
	return `#${body}${part}`
}

export function rgbToHex(rgb: Rgb): string {
	const part = (value: number) =>
		Math.round(clamp(value, 0, 255))
			.toString(16)
			.padStart(2, '0')
	return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`
}

function toLinear(channel: number): number {
	const value = channel / 255
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function fromLinear(channel: number): number {
	const value =
		channel <= 0.0031308
			? channel * 12.92
			: 1.055 * channel ** (1 / 2.4) - 0.055
	return value * 255
}

function rgbToXyz(rgb: Rgb): Rgb {
	const [r, g, b] = [toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])]
	return [
		r * 0.4124 + g * 0.3576 + b * 0.1805,
		r * 0.2126 + g * 0.7152 + b * 0.0722,
		r * 0.0193 + g * 0.1192 + b * 0.9505,
	]
}

function xyzToRgb(xyz: Rgb): Rgb {
	const [r, g, b] = xyz
	return [
		fromLinear(r * 3.2406 - g * 1.5372 - b * 0.4986),
		fromLinear(-r * 0.9689 + g * 1.8758 + b * 0.0415),
		fromLinear(r * 0.0557 - g * 0.204 + b * 1.057),
	]
}

function labF(t: number): number {
	return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

function labInv(t: number): number {
	const cubed = t ** 3
	return cubed > 0.008856 ? cubed : (t - 16 / 116) / 7.787
}

export interface Lab {
	l: number
	a: number
	b: number
}

export function rgbToLab(rgb: Rgb): Lab {
	const [x, y, z] = rgbToXyz(rgb)
	const fx = labF(x / WHITE[0])
	const fy = labF(y / WHITE[1])
	const fz = labF(z / WHITE[2])
	return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function labToRgb(lab: Lab): Rgb {
	const fy = (lab.l + 16) / 116
	const fx = fy + lab.a / 500
	const fz = fy - lab.b / 200
	return xyzToRgb([
		labInv(fx) * WHITE[0],
		labInv(fy) * WHITE[1],
		labInv(fz) * WHITE[2],
	])
}

export function labOf(hex: string): Lab {
	return rgbToLab(hexToRgb(hex))
}

export interface Lch {
	l: number
	c: number
	h: number
}

export function lchOf(hex: string): Lch {
	const { l, a, b } = labOf(hex)
	const h = (Math.atan2(b, a) * 180) / Math.PI
	return { l, c: Math.hypot(a, b), h: (h + 360) % 360 }
}

function inGamut(rgb: Rgb): boolean {
	return (
		rgb[0] >= -0.5 &&
		rgb[0] <= 255.5 &&
		rgb[1] >= -0.5 &&
		rgb[1] <= 255.5 &&
		rgb[2] >= -0.5 &&
		rgb[2] <= 255.5
	)
}

function rawTone(hue: number, chroma: number, tone: number): Rgb {
	const rad = (hue * Math.PI) / 180
	return labToRgb({
		l: tone,
		a: Math.cos(rad) * chroma,
		b: Math.sin(rad) * chroma,
	})
}

/**
 * A colour at a fixed Lab lightness. Material's tonal palettes all sit on one
 * lightness axis, so tone is just L*: 0 is black, 100 is white.
 *
 * Lab is wider than sRGB, so a bright tone with real chroma lands outside the
 * gamut. Rather than clipping the channels (which skews the hue), chroma is
 * scaled down until the colour fits.
 */
export function toneHex(hue: number, chroma: number, tone: number): string {
	const rgb = rawTone(hue, chroma, tone)
	if (inGamut(rgb)) return rgbToHex(rgb)
	let lo = 0
	let hi = chroma
	for (let i = 0; i < 16; i++) {
		const mid = (lo + hi) / 2
		if (inGamut(rawTone(hue, mid, tone))) lo = mid
		else hi = mid
	}
	return rgbToHex(rawTone(hue, lo, tone))
}

/**
 * Material's chroma peaks around tone 50 and falls off toward black and white,
 * which is what keeps the dark surfaces grey instead of muddy.
 */
export function chromaAt(base: number, tone: number): number {
	const off = Math.abs(tone - 50) / 55
	return base * Math.max(0.12, 1 - off * off)
}
