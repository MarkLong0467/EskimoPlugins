import type { ByteReader } from './reader'

/**
 * Reading TIFF structures.
 *
 * Most RAW files (NEF, CR2, ARW, DNG, ORF, RW2, PEF...) are TIFF files, and the EXIF block of a JPEG is a small TIFF file
 * too. Both are made of image file directories (IFDs): lists of tags, each with a type, a count and a value.
 */

/** Bytes per value for each TIFF data type, so an entry's total size (and whether it fits inline) can be worked out. */
const TYPE_SIZES: Record<number, number> = {
	1: 1,
	2: 1,
	3: 2,
	4: 4,
	5: 8,
	6: 1,
	7: 1,
	8: 2,
	9: 4,
	10: 8,
	11: 4,
	12: 8,
	13: 4,
}

/** The numbers some RAW formats use instead of 42 in their TIFF header: Olympus (`RO`, `SR`) and Panasonic (`U`). */
const RAW_MAGICS = new Set([42, 0x4f52, 0x5352, 0x55])

/** One entry of an image file directory (IFD). */
export interface IfdEntry {
	type: number
	count: number
	/** Absolute offset of the value bytes. */
	valueOffset: number
}

/** A parsed IFD: its entries by tag and the offset of the next IFD (0 if none). */
export interface Ifd {
	entries: Map<number, IfdEntry>
	next: number
}

/**
 * Reads numbers and IFDs from a TIFF structure through a `ByteReader`, in the byte order (little or big endian) the
 * structure declares in its header.
 *
 * @param read Reads bytes of the whole file.
 * @param le True for little endian.
 * @param base Where the TIFF header starts in the file. Offsets inside the structure count from there (it is not 0 for
 *   the EXIF block of a JPEG).
 */
export class TiffReader {
	constructor(
		readonly read: ByteReader,
		readonly le: boolean,
		readonly base = 0,
	) {}

	u16(b: Uint8Array, i: number): number {
		return this.le ? b[i]! | (b[i + 1]! << 8) : (b[i]! << 8) | b[i + 1]!
	}

	u32(b: Uint8Array, i: number): number {
		return this.le
			? (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0
			: ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0
	}

	/** Reads the IFD at `offset` (counted from the header). */
	async ifd(offset: number): Promise<Ifd | null> {
		const at = this.base + offset
		const head = await this.read(at, 2)
		if (head.length < 2) return null

		const count = this.u16(head, 0)
		if (count > 2000) return null
		const body = await this.read(at + 2, count * 12 + 4)
		if (body.length < count * 12 + 4) return null

		const entries = new Map<number, IfdEntry>()
		for (let i = 0; i < count; i++) {
			const p = i * 12
			const type = this.u16(body, p + 2)
			const n = this.u32(body, p + 4)
			const size = (TYPE_SIZES[type] ?? 1) * n
			entries.set(this.u16(body, p), {
				type,
				count: n,
				valueOffset:
					size <= 4 ? at + 2 + p + 8 : this.base + this.u32(body, p + 8),
			})
		}

		return { entries, next: this.u32(body, count * 12) }
	}

	/** Reads integer values of a BYTE, SHORT, LONG or IFD entry. */
	async values(entry: IfdEntry, max = 16): Promise<number[]> {
		// BYTE and UNDEFINED values are one byte each, SHORT two, everything else four.
		const size =
			entry.type === 1 || entry.type === 7 ? 1 : entry.type === 3 ? 2 : 4
		const n = Math.min(entry.count, max)
		const b = await this.read(entry.valueOffset, n * size)
		const out: number[] = []
		for (let i = 0; i + size <= b.length; i += size)
			out.push(
				size === 1 ? b[i]! : size === 2 ? this.u16(b, i) : this.u32(b, i),
			)
		return out
	}

	/** The first integer value of an entry, or nothing if the entry is missing. */
	async value(entry: IfdEntry | undefined): Promise<number | undefined> {
		if (!entry) return undefined
		return (await this.values(entry, 1))[0]
	}

	/** The text of an ASCII entry, without its ending zero. */
	async ascii(entry: IfdEntry | undefined): Promise<string | undefined> {
		if (!entry || entry.type !== 2) return undefined
		const b = await this.read(entry.valueOffset, Math.min(entry.count, 256))
		let end = b.length
		while (end > 0 && b[end - 1] === 0) end--
		let text = ''
		for (let i = 0; i < end; i++) text += String.fromCharCode(b[i]!)
		return text.trim() || undefined
	}

	/** Reads RATIONAL (5) or SRATIONAL (10) values as numbers (numerator divided by denominator). */
	async rationals(entry: IfdEntry | undefined, max = 3): Promise<number[]> {
		if (!entry || (entry.type !== 5 && entry.type !== 10)) return []
		const n = Math.min(entry.count, max)
		const b = await this.read(entry.valueOffset, n * 8)
		const out: number[] = []
		for (let i = 0; i + 8 <= b.length; i += 8) {
			const numerator = entry.type === 10 ? this.u32(b, i) | 0 : this.u32(b, i)
			const denominator =
				entry.type === 10 ? this.u32(b, i + 4) | 0 : this.u32(b, i + 4)
			out.push(denominator === 0 ? 0 : numerator / denominator)
		}
		return out
	}
}

/**
 * Opens the TIFF structure that starts at `base`.
 *
 * @returns The reader and the offset of the first IFD, or `null` if there is no TIFF header there.
 */
export async function openTiff(
	read: ByteReader,
	base = 0,
): Promise<{ tiff: TiffReader; ifd0: number } | null> {
	const header = await read(base, 8)
	if (header.length < 8) return null

	const order = String.fromCharCode(header[0]!, header[1]!)
	if (order !== 'II' && order !== 'MM') return null

	const tiff = new TiffReader(read, order === 'II', base)
	if (!RAW_MAGICS.has(tiff.u16(header, 2))) return null
	return { tiff, ifd0: tiff.u32(header, 4) }
}
