/**
 * Draws text on fire: bold rounded letters with a red outline and a burning fill, with flames licking up from them. The
 * flames move from picture to picture, and the last picture leads back into the first, so the result loops.
 *
 * Everything is worked out from numbers, with no canvas: the text becomes a mask, a heat field is swept upward from the
 * mask (so flames rise, sway and taper off), and the heat is turned into a colour from a short list. Each step works on
 * `Float32Array`s the size of the picture. The same text and seed always give the same pictures.
 *
 * A picture is kept as one number per pixel, a place in a list of 256 colours, which is how a GIF stores it. The letters and
 * the flames are drawn by *heat* and *how solid*: the list holds every mix of 32 heats and 8 amounts of solid over the
 * background. With a see-through background it holds 255 heats and one empty colour, because a GIF cannot be half see-through.
 */

import { dotsOf, drawable, LINE_GAP, LINE_ROWS, widthOf } from './font'

export type FireStyle = 'fire' | 'blue' | 'green' | 'purple'
export type FireSize = 'small' | 'medium' | 'large'
export type FireHeight = 'low' | 'medium' | 'high'
export type FireBackground = 'transparent' | 'dark' | 'white'

/** How the picture looks. */
export interface FireOptions {
	style: FireStyle
	size: FireSize
	height: FireHeight
	background: FireBackground
	/** A soft glow around the flames. */
	glow: boolean
	/** How many pictures the flames move through. */
	motion: FireMotion
	/** Changes where the flames go. The same seed always gives the same flames. */
	seed: number
}

/** How many pictures there are in a loop, for each setting of the animation. */
export const FRAME_COUNTS = { off: 1, light: 6, normal: 8, smooth: 12 } as const
export type FireMotion = keyof typeof FRAME_COUNTS

/** What is ready to be drawn: the letters are done, the flames are drawn one picture at a time. */
export interface Prepared {
	width: number
	height: number
	/** The lines the text was split into. */
	lines: string[]
	/** The size of one dot of the font, in pixels, after the picture was kept inside its limits. */
	scale: number
	/** How many pictures make a loop. */
	frames: number
	/** The 256 colours, 3 bytes each. */
	palette: Uint8Array
	/** The colour that is see-through, or -1. */
	transparent: number
	/** Draws picture number `n`: one byte a pixel, a place in the palette. */
	frame(n: number): Uint8Array
}

/** How big a dot of the font is for each size. */
export const SCALES: Record<FireSize, number> = {
	small: 6,
	medium: 9,
	large: 12,
}
/** How long the flames are, as a share of a letter's height. */
export const FLAME_LENGTHS: Record<FireHeight, number> = {
	low: 0.55,
	medium: 1,
	high: 1.5,
}

/** The most pixels across and the most pixels in all. Keeps the file small enough for Discord and the phone's memory. */
export const MAX_WIDTH = 1100
export const MAX_PIXELS = 1_400_000

type Stop = readonly [heat: number, r: number, g: number, b: number]

/** Heat to colour, for each style. */
const RAMPS: Record<FireStyle, readonly Stop[]> = {
	fire: [
		[0, 70, 0, 0],
		[0.18, 190, 12, 0],
		[0.42, 245, 70, 0],
		[0.62, 255, 140, 10],
		[0.8, 255, 200, 40],
		[1, 255, 245, 170],
	],
	blue: [
		[0, 0, 5, 70],
		[0.18, 10, 30, 175],
		[0.42, 30, 90, 255],
		[0.62, 60, 150, 255],
		[0.8, 140, 215, 255],
		[1, 225, 248, 255],
	],
	green: [
		[0, 0, 50, 0],
		[0.18, 5, 120, 10],
		[0.42, 30, 195, 25],
		[0.62, 110, 235, 40],
		[0.8, 190, 255, 90],
		[1, 240, 255, 190],
	],
	purple: [
		[0, 40, 0, 70],
		[0.18, 100, 10, 170],
		[0.42, 160, 40, 225],
		[0.62, 205, 90, 255],
		[0.8, 235, 160, 255],
		[1, 250, 225, 255],
	],
}

/** The colour for a heat from 0 to 1. */
function ramp(stops: readonly Stop[], heat: number): [number, number, number] {
	const t = heat < 0 ? 0 : Math.min(heat, 1)
	for (let i = 1; i < stops.length; i++) {
		const to = stops[i] as Stop
		if (t <= to[0]) {
			const from = stops[i - 1] as Stop
			const k = (t - from[0]) / (to[0] - from[0] || 1)
			return [
				from[1] + (to[1] - from[1]) * k,
				from[2] + (to[2] - from[2]) * k,
				from[3] + (to[3] - from[3]) * k,
			]
		}
	}
	const last = stops[stops.length - 1] as Stop
	return [last[1], last[2], last[3]]
}

const smooth = (low: number, high: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - low) / (high - low)))
	return t * t * (3 - 2 * t)
}

/** A number from 0 up to 1 that is always the same for the same place and seed. */
function hash(x: number, y: number, seed: number): number {
	let h =
		Math.imul(x, 374761393) +
		Math.imul(y, 668265263) +
		Math.imul(seed, 1274126177)
	h = Math.imul(h ^ (h >>> 13), 1274126177)
	h ^= h >>> 16
	return (h >>> 0) / 4294967296
}

/**
 * Smooth noise: 0 up to 1, changing slowly from place to place. It repeats every `period` steps downward, so moving it
 * down by exactly `period` gives the picture it started with, which is what lets the flames loop.
 */
function noise(x: number, y: number, seed: number, period: number): number {
	const ix = Math.floor(x)
	const iy = Math.floor(y)
	const fx = x - ix
	const fy = y - iy
	const sx = fx * fx * (3 - 2 * fx)
	const sy = fy * fy * (3 - 2 * fy)
	const row0 = ((iy % period) + period) % period
	const row1 = (row0 + 1) % period
	const a = hash(ix, row0, seed)
	const b = hash(ix + 1, row0, seed)
	const c = hash(ix, row1, seed)
	const d = hash(ix + 1, row1, seed)
	return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** Noise with a coarse layer and finer ones on top, 0 up to 1. Repeats every `period` steps. */
function fbm(x: number, y: number, seed: number, period: number): number {
	return (
		noise(x, y, seed, period) * 0.55 +
		noise(x * 2, y * 2, seed + 11, period * 2) * 0.3 +
		noise(x * 4, y * 4, seed + 23, period * 4) * 0.15
	)
}

/** A blur by averaging, done as two passes along each direction. */
function blur(
	source: Float32Array,
	width: number,
	height: number,
	radius: number,
): Float32Array {
	if (radius < 1) return source.slice()
	let from = source
	let to = new Float32Array(source.length)
	const size = radius * 2 + 1
	for (let pass = 0; pass < 2; pass++) {
		for (let y = 0; y < height; y++) {
			let sum = 0
			const row = y * width
			for (let x = -radius; x <= radius; x++)
				sum += from[row + Math.min(width - 1, Math.max(0, x))] ?? 0
			for (let x = 0; x < width; x++) {
				to[row + x] = sum / size
				sum +=
					(from[row + Math.min(width - 1, x + radius + 1)] ?? 0) -
					(from[row + Math.max(0, x - radius)] ?? 0)
			}
		}
		from = to
		to = new Float32Array(source.length)
		for (let x = 0; x < width; x++) {
			let sum = 0
			for (let y = -radius; y <= radius; y++)
				sum += from[Math.min(height - 1, Math.max(0, y)) * width + x] ?? 0
			for (let y = 0; y < height; y++) {
				to[y * width + x] = sum / size
				sum +=
					(from[Math.min(height - 1, y + radius + 1) * width + x] ?? 0) -
					(from[Math.max(0, y - radius) * width + x] ?? 0)
			}
		}
		from = to
		to = new Float32Array(source.length)
	}
	return from
}

/** How wide a line is, in dots. */
function lineDots(line: string): number {
	let total = 0
	for (const char of line) total += widthOf(char)
	return Math.max(0, total - 1)
}

/**
 * Splits text into lines of at most `columns` dots, at spaces where it can and in the middle of a word where it has to.
 * A line break in the text starts a new line.
 */
export function wrap(text: string, columns: number): string[] {
	const lines: string[] = []
	for (const paragraph of text.split(/\r?\n/)) {
		let line = ''
		for (const word of paragraph.split(' ')) {
			let rest = word
			while (rest) {
				const joined = line ? `${line} ${rest}` : rest
				if (lineDots(joined) <= columns) {
					line = joined
					rest = ''
				} else if (line) {
					lines.push(line)
					line = ''
				} else {
					let cut = 1
					while (
						cut < rest.length &&
						lineDots(rest.slice(0, cut + 1)) <= columns
					)
						cut++
					lines.push(rest.slice(0, cut))
					rest = rest.slice(cut)
				}
			}
		}
		lines.push(line)
	}
	while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
	return lines
}

/** What the picture would measure, before it is drawn. */
export interface Plan {
	lines: string[]
	scale: number
	width: number
	height: number
	padTop: number
	padSide: number
	padBottom: number
	flame: number
}

/**
 * Works out the lines and the size of the picture. The dots are made smaller when the picture would be too big.
 *
 * @returns Nothing when the text has a character the font cannot draw, or has no letters.
 */
export function plan(
	text: string,
	options: Pick<FireOptions, 'size' | 'height'>,
): Plan | undefined {
	const clean = drawable(text)
	if (clean === undefined || clean.trim() === '') return undefined
	for (let scale = SCALES[options.size]; scale >= 3; scale--) {
		const padSide = Math.round(scale * 3)
		const columns = Math.floor((MAX_WIDTH - padSide * 2) / scale)
		const lines = wrap(clean.trim(), columns)
		const widest = Math.max(...lines.map(lineDots))
		const rows = lines.length * LINE_ROWS + (lines.length - 1) * LINE_GAP
		const flame = Math.round(7 * scale * FLAME_LENGTHS[options.height])
		const padTop = Math.round(flame * 0.85) + scale
		const padBottom = Math.round(scale * 2.5)
		const width = Math.ceil(widest * scale) + padSide * 2
		const height = rows * scale + padTop + padBottom
		if (width <= MAX_WIDTH && width * height <= MAX_PIXELS) {
			return { lines, scale, width, height, padTop, padSide, padBottom, flame }
		}
	}
	return undefined
}

/**
 * Gets a picture ready: works out the letters, the outline and the colours.
 *
 * @returns Nothing when the text cannot be drawn (see {@link plan}).
 */
export function prepareFire(
	text: string,
	options: FireOptions,
): Prepared | undefined {
	const layout = plan(text, options)
	if (!layout) return undefined
	const { lines, scale: k, width, height, padTop, padSide, flame } = layout
	const size = width * height
	const seed = options.seed | 0
	const frames = FRAME_COUNTS[options.motion] ?? 1

	// 1. The letters: every dot of the font is a round blob, so neighbours join into smooth, bold strokes.
	const mask = new Float32Array(size)
	const radius = k * 0.72
	let top = padTop
	for (const line of lines) {
		let left = padSide
		for (const char of line) {
			for (const [column, row] of dotsOf(char)) {
				const cx = left + (column + 0.5) * k
				const cy = top + (row + 0.5) * k
				const x0 = Math.max(0, Math.floor(cx - radius - 1))
				const x1 = Math.min(width - 1, Math.ceil(cx + radius + 1))
				const y0 = Math.max(0, Math.floor(cy - radius - 1))
				const y1 = Math.min(height - 1, Math.ceil(cy + radius + 1))
				for (let y = y0; y <= y1; y++) {
					for (let x = x0; x <= x1; x++) {
						const dx = x + 0.5 - cx
						const dy = y + 0.5 - cy
						const cover = radius + 0.5 - Math.sqrt(dx * dx + dy * dy)
						if (cover <= 0) continue
						const value = Math.min(cover, 1)
						const at = y * width + x
						if (value > (mask[at] ?? 0)) mask[at] = value
					}
				}
			}
			left += widthOf(char) * k
		}
		top += (LINE_ROWS + LINE_GAP) * k
	}
	// Smooth the beads where dots meet.
	const soft = blur(mask, width, height, Math.max(1, Math.round(k * 0.34)))
	for (let i = 0; i < size; i++) mask[i] = smooth(0.42, 0.58, soft[i] ?? 0)

	// 2. How close to the edge each pixel of a letter is: the red outline. And how each pixel of a letter burns, which moves.
	const inner = blur(mask, width, height, Math.max(1, Math.round(k * 0.3)))
	const edge = new Float32Array(size)
	for (let i = 0; i < size; i++)
		edge[i] = Math.min(1, (1 - smooth(0.5, 0.9, inner[i] ?? 0)) * 1.1)

	const stops = RAMPS[options.style]
	const see = options.background === 'transparent'
	const back: [number, number, number] =
		options.background === 'dark'
			? [22, 12, 12]
			: options.background === 'white'
				? [255, 255, 255]
				: [0, 0, 0]

	// The 256 colours. Over a background: 32 heats times 8 amounts of solid. See-through: colour 0 is empty, the rest are heats.
	const palette = new Uint8Array(768)
	if (see) {
		for (let i = 1; i < 256; i++) {
			const colour = ramp(stops, (i - 1) / 254)
			palette[i * 3] = colour[0]
			palette[i * 3 + 1] = colour[1]
			palette[i * 3 + 2] = colour[2]
		}
	} else {
		for (let heat = 0; heat < 32; heat++) {
			const colour = ramp(stops, heat / 31)
			for (let solid = 0; solid < 8; solid++) {
				const k2 = solid / 7
				const at = (heat * 8 + solid) * 3
				palette[at] = colour[0] * k2 + back[0] * (1 - k2)
				palette[at + 1] = colour[1] * k2 + back[1] * (1 - k2)
				palette[at + 2] = colour[2] * k2 + back[2] * (1 - k2)
			}
		}
	}

	/** Heat of the flames above the letters for picture `n`: swept upward from the letters. */
	const sweep = (n: number): Float32Array => {
		const phase = frames > 1 ? n / frames : 0
		const heat = new Float32Array(size)
		const fade = 1 / (flame * 0.8)
		for (let y = height - 1; y >= 0; y--) {
			for (let x = 0; x < width; x++) {
				let below = 0
				if (y < height - 1) {
					// Each row up, the heat drifts sideways a little, spreads, and fades. Columns fade at different speeds, which is
					// what makes separate tongues with pointed tips. The noise slides upward from picture to picture.
					const drift =
						(noise(x / (k * 3.2), y / (k * 2.6) + phase * 3, seed + 3, 3) -
							0.5) *
						1.5
					const col = Math.round(x + drift)
					const base = (y + 1) * width
					const left =
						heat[base + Math.min(width - 1, Math.max(0, col - 1))] ?? 0
					const mid = heat[base + Math.min(width - 1, Math.max(0, col))] ?? 0
					const right =
						heat[base + Math.min(width - 1, Math.max(0, col + 1))] ?? 0
					below = (left + 2 * mid + right) / 4
					below -=
						fade *
						(0.35 +
							1.9 * noise(x / (k * 1.5), y / (k * 9) + phase * 2, seed + 7, 2))
				}
				const own = mask[y * width + x] ?? 0
				heat[y * width + x] = own > below ? own : Math.max(below, 0)
			}
		}
		return heat
	}

	// 3. A soft glow around everything that burns. It is worked out once, from the first picture, and does not move.
	let halo: Float32Array | undefined
	if (options.glow && !see) {
		const first = sweep(0)
		const burning = new Float32Array(size)
		for (let i = 0; i < size; i++)
			burning[i] = Math.max(mask[i] ?? 0, smooth(0.1, 0.5, first[i] ?? 0))
		halo = blur(burning, width, height, Math.round(k * 0.9))
	}

	/** Picture number `n`. */
	const frame = (n: number): Uint8Array => {
		const phase = frames > 1 ? n / frames : 0
		const heat = sweep(n)
		const out = new Uint8Array(size)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const at = y * width + x
				const letter = mask[at] ?? 0
				const burn = heat[at] ?? 0
				const flameAlpha = letter < 1 ? smooth(0.1, 0.4, burn) : 0
				let h = burn * 0.9
				let a = flameAlpha
				if (letter > 0) {
					const texture = fbm(
						x / (k * 1.5),
						y / (k * 3.4) - x / (k * 40) + phase * 2,
						seed + 31,
						2,
					)
					const fill = 0.26 + 0.62 * smooth(0.25, 0.85, texture)
					const body = fill + (0.15 - fill) * (edge[at] ?? 0)
					h = body * letter + h * (1 - letter)
					a = letter + (1 - letter) * flameAlpha
				}
				if (halo) {
					const glow = Math.min(1, (halo[at] ?? 0) * 0.55) * (1 - a)
					if (glow > 0.001) {
						const total = a + glow
						h = (h * a + 0.16 * glow) / total
						a = total
					}
				}
				if (see) {
					out[at] =
						a < 0.5 ? 0 : 1 + Math.round(Math.min(1, Math.max(0, h)) * 254)
				} else {
					const heatStep = Math.round(Math.min(1, Math.max(0, h)) * 31)
					const solidStep = Math.round(Math.min(1, Math.max(0, a)) * 7)
					out[at] = heatStep * 8 + solidStep
				}
			}
		}
		return out
	}

	return {
		width,
		height,
		lines,
		scale: k,
		frames,
		palette,
		transparent: see ? 0 : -1,
		frame,
	}
}

/** The text for the starting seed: the same message always burns the same way. */
export function seedOf(text: string): number {
	let h = 2166136261
	for (let i = 0; i < text.length; i++)
		h = Math.imul(h ^ text.charCodeAt(i), 16777619)
	return h >>> 0
}
