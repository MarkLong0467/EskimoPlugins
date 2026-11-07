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
 * Smooth noise worked out from a table of random numbers, so asking for a value is a few array reads. That matters: a phone
 * asks for hundreds of thousands of them.
 *
 * It changes slowly from place to place, and repeats every `period` steps downward, so moving it down by exactly `period`
 * gives the picture it started with, which is what lets the flames loop.
 *
 * @param columns How far across it will be asked (`x` goes from 0 up to this).
 */
function field(
	seed: number,
	period: number,
	columns: number,
): (x: number, y: number) => number {
	const across = Math.ceil(columns) + 2
	const table = new Float32Array(across * period)
	for (let ix = 0; ix < across; ix++)
		for (let row = 0; row < period; row++)
			table[ix * period + row] = hash(ix, row, seed)
	return (x, y) => {
		let ix = Math.floor(x)
		if (ix < 0) ix = 0
		else if (ix > across - 2) ix = across - 2
		const iy = Math.floor(y)
		const fx = x - Math.floor(x)
		const fy = y - iy
		const sx = fx * fx * (3 - 2 * fx)
		const sy = fy * fy * (3 - 2 * fy)
		const row0 = ((iy % period) + period) % period
		const row1 = row0 + 1 === period ? 0 : row0 + 1
		const base = ix * period
		const a = table[base + row0] as number
		const b = table[base + period + row0] as number
		const c = table[base + row1] as number
		const d = table[base + period + row1] as number
		return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
	}
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
 * The letters are drawn at the full size. The flames and the pattern inside the letters are worked out at half the size, which
 * is a quarter of the work, and looked up from there. Flames are soft, so nobody can see it.
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
						const value = cover >= 1 ? 1 : cover
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

	// 2. How close to the edge each pixel of a letter is: the red outline.
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
				const amount = solid / 7
				const at = (heat * 8 + solid) * 3
				palette[at] = colour[0] * amount + back[0] * (1 - amount)
				palette[at + 1] = colour[1] * amount + back[1] * (1 - amount)
				palette[at + 2] = colour[2] * amount + back[2] * (1 - amount)
			}
		}
	}

	// 3. The flames and the pattern, at half the size.
	const w2 = Math.ceil(width / 2)
	const h2 = Math.ceil(height / 2)
	const size2 = w2 * h2
	const k2 = k / 2
	const mask2 = new Float32Array(size2)
	for (let y = 0; y < h2; y++) {
		for (let x = 0; x < w2; x++) {
			const at = y * 2 * width + x * 2
			const right = x * 2 + 1 < width ? 1 : 0
			const below = y * 2 + 1 < height ? width : 0
			mask2[y * w2 + x] =
				((mask[at] ?? 0) +
					(mask[at + right] ?? 0) +
					(mask[at + below] ?? 0) +
					(mask[at + below + right] ?? 0)) /
				4
		}
	}
	const drift = field(seed + 3, 3, w2 / (k2 * 3.2))
	const tongues = field(seed + 7, 2, w2 / (k2 * 1.5))
	const coarse = field(seed + 31, 2, w2 / (k2 * 1.5))
	const medium = field(seed + 42, 4, (w2 * 2) / (k2 * 1.5))
	const fine = field(seed + 54, 8, (w2 * 4) / (k2 * 1.5))
	const fade = 2 / (flame * 1.15)

	/** The heat of the flames for picture `n`, swept upward from the letters, and how solid that makes them. */
	const sweep = (n: number): { burn: Float32Array; solid: Float32Array } => {
		const phase = frames > 1 ? n / frames : 0
		const burn = new Float32Array(size2)
		const solid = new Float32Array(size2)
		for (let y = h2 - 1; y >= 0; y--) {
			const row = y * w2
			for (let x = 0; x < w2; x++) {
				let heat = 0
				if (y < h2 - 1) {
					// Each row up, the heat drifts sideways a little, spreads, and fades. Columns fade at different speeds, which is
					// what makes separate tongues with pointed tips. The noise slides upward from picture to picture.
					const sway =
						(drift(x / (k2 * 3.2), y / (k2 * 2.6) + phase * 3) - 0.5) * 1.5
					const col = Math.round(x + sway)
					const base = row + w2
					const left = burn[
						base + (col < 1 ? 0 : col - 1 >= w2 ? w2 - 1 : col - 1)
					] as number
					const mid = burn[
						base + (col < 0 ? 0 : col >= w2 ? w2 - 1 : col)
					] as number
					const right = burn[
						base + (col + 1 < 0 ? 0 : col + 1 >= w2 ? w2 - 1 : col + 1)
					] as number
					heat =
						(left + 2 * mid + right) / 4 -
						fade *
							(0.35 + 1.9 * tongues(x / (k2 * 1.5), y / (k2 * 9) + phase * 2))
				}
				const own = mask2[row + x] as number
				const value = own > heat ? own : heat > 0 ? heat : 0
				burn[row + x] = value
				solid[row + x] = value < 0.1 ? 0 : smooth(0.1, 0.4, value)
			}
		}
		return { burn, solid }
	}

	/** How hot each part of the letters is for picture `n`: a pattern of streaks that rises. */
	const patternOf = (n: number): Float32Array => {
		const phase = frames > 1 ? n / frames : 0
		const fill = new Float32Array(size2)
		for (let y = 0; y < h2; y++) {
			const row = y * w2
			for (let x = 0; x < w2; x++) {
				if ((mask2[row + x] as number) === 0) continue
				const u = x / (k2 * 1.5)
				const v = y / (k2 * 3.4) - x / (k2 * 40) + phase * 2
				const texture =
					coarse(u, v) * 0.55 +
					medium(u * 2, v * 2) * 0.3 +
					fine(u * 4, v * 4) * 0.15
				fill[row + x] = 0.26 + 0.62 * smooth(0.25, 0.85, texture)
			}
		}
		return fill
	}

	// 4. A soft glow around everything that burns. It is worked out once, from the first picture, and does not move.
	const first = sweep(0)
	let halo: Float32Array | undefined
	/** The picture before any letters or flames: the background, and the glow over it. */
	const base = new Uint8Array(size)
	if (options.glow && !see) {
		const burning = new Float32Array(size)
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++) {
				const at = y * width + x
				burning[at] = Math.max(
					mask[at] ?? 0,
					first.solid[(y >> 1) * w2 + (x >> 1)] ?? 0,
				)
			}
		halo = blur(burning, width, height, Math.round(k * 0.9))
		for (let i = 0; i < size; i++)
			base[i] = 5 * 8 + Math.round(Math.min(1, (halo[i] ?? 0) * 0.55) * 7)
	}

	/** Picture number `n`. */
	const frame = (n: number): Uint8Array => {
		const { burn, solid } = n === 0 ? first : sweep(n)
		const fill = patternOf(n)
		const out = base.slice()
		for (let y = 0; y < height; y++) {
			const row = y * width
			const row2 = (y >> 1) * w2
			for (let x = 0; x < width; x++) {
				const at = row + x
				const letter = mask[at] as number
				const cell = row2 + (x >> 1)
				const flameAmount = letter < 1 ? (solid[cell] as number) : 0
				if (letter === 0 && flameAmount === 0) continue
				let h = (burn[cell] as number) * 0.9
				let a = flameAmount
				if (letter > 0) {
					const inside = fill[cell] as number
					const body = inside + (0.15 - inside) * (edge[at] as number)
					h = body * letter + h * (1 - letter)
					a = letter + (1 - letter) * flameAmount
				}
				if (halo) {
					const glow = Math.min(1, (halo[at] as number) * 0.55) * (1 - a)
					if (glow > 0.001) {
						const total = a + glow
						h = (h * a + 0.16 * glow) / total
						a = total
					}
				}
				if (h < 0) h = 0
				else if (h > 1) h = 1
				if (see) {
					out[at] = a < 0.5 ? 0 : 1 + Math.round(h * 254)
				} else {
					out[at] = Math.round(h * 31) * 8 + Math.round((a > 1 ? 1 : a) * 7)
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
