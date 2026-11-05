'use strict'

/**
 * Tests for NEF Viewer. Run with: node tests/nef-viewer.test.cjs
 * (build first: bun run build:dev nef-viewer, or just run `bun run test`).
 *
 * The tests build small NEF-shaped files (a real TIFF structure with an embedded JPEG) and serve them from a fake
 * server that understands HTTP Range requests, so the whole pipeline runs: find the preview, download only those
 * bytes, add the orientation, write the cache, and swap the attachment.
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('NEF Viewer')

// ---------------------------------------------------------------------------------------------------------------
// Test data: NEF files and JPEGs made from scratch
// ---------------------------------------------------------------------------------------------------------------

/** A small JPEG that has a size marker (SOF0). `exif` adds an APP1 "Exif" segment. `pad` adds a comment of that many bytes. */
function makeJpeg({ width, height, exif = false, pad = 0 }) {
	const bytes = [0xff, 0xd8]
	if (exif) bytes.push(0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00)
	if (pad) bytes.push(0xff, 0xfe, ((pad + 2) >> 8) & 0xff, (pad + 2) & 0xff, ...new Array(pad).fill(0x41))
	bytes.push(
		0xff, 0xc0, 0x00, 0x11, 0x08,
		(height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff,
		0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
	)
	bytes.push(0xff, 0xd9)
	return Uint8Array.from(bytes)
}

/**
 * Builds a NEF-shaped file: a TIFF header, IFD0 (with orientation and a list of SubIFDs), one SubIFD per preview with
 * the JPEG's compression, offset and length, then the JPEG bytes. `junk` is the number of filler bytes between the
 * directories and the first JPEG, so a preview can sit beyond the first 256 KB.
 */
function makeNef({ littleEndian = true, orientation = 1, previews, junk = 0 }) {
	const w16 = n => (littleEndian ? [n & 255, (n >> 8) & 255] : [(n >> 8) & 255, n & 255])
	const w32 = n =>
		littleEndian
			? [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]
			: [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]
	const entry = (tag, type, count, value) => [...w16(tag), ...w16(type), ...w32(count), ...value]

	const ifd0Size = 2 + 2 * 12 + 4
	const arrayOffset = 8 + ifd0Size
	const arraySize = previews.length > 1 ? previews.length * 4 : 0
	const subIfdSize = 2 + 3 * 12 + 4
	const firstSubIfd = arrayOffset + arraySize
	let jpegStart = firstSubIfd + previews.length * subIfdSize + junk
	const jpegs = previews.map(preview => makeJpeg(preview))

	const header = [littleEndian ? 0x49 : 0x4d, littleEndian ? 0x49 : 0x4d, ...w16(42), ...w32(8)]
	const subOffsets = previews.map((_, index) => firstSubIfd + index * subIfdSize)
	const ifd0 = [
		...w16(2),
		...entry(0x0112, 3, 1, [...w16(orientation), 0, 0]),
		...entry(0x014a, 4, previews.length, previews.length > 1 ? w32(arrayOffset) : w32(subOffsets[0])),
		...w32(0),
	]
	const array = previews.length > 1 ? subOffsets.flatMap(offset => w32(offset)) : []
	const subIfds = previews.flatMap((preview, index) => {
		const offset = jpegStart
		jpegStart += jpegs[index].length
		return [
			...w16(3),
			...entry(0x0103, 3, 1, [...w16(preview.compression ?? 7), 0, 0]),
			...entry(0x0201, 4, 1, w32(offset)),
			...entry(0x0202, 4, 1, w32(jpegs[index].length)),
			...w32(0),
		]
	})
	return Uint8Array.from([...header, ...ifd0, ...array, ...subIfds, ...new Array(junk).fill(0), ...jpegs.flatMap(jpeg => [...jpeg])])
}

const toBase64 = bytes => Buffer.from(bytes).toString('base64')
const fromBase64 = text => new Uint8Array(Buffer.from(text, 'base64'))
const sameBytes = (a, b) => a.length === b.length && a.every((byte, index) => byte === b[index])

// ---------------------------------------------------------------------------------------------------------------
// A fake file server and phone file system
// ---------------------------------------------------------------------------------------------------------------

/**
 * Installs a fake `fetch` that serves `files` (url to bytes) and understands Range requests.
 * `mode` can be 'ignore-range' (always answers 200 with the whole file), or a status code number to fail with.
 * `gate` is an optional promise every request waits for, to hold conversions open.
 */
function installServer(files, { mode = 'range', gate = null } = {}) {
	const requests = []
	let inFlight = 0
	let maxInFlight = 0
	globalThis.fetch = async (url, options = {}) => {
		const range = /bytes=(\d+)-(\d+)/.exec(options.headers?.Range ?? '')
		requests.push({ url, start: range ? Number(range[1]) : null, end: range ? Number(range[2]) : null })
		inFlight += 1
		maxInFlight = Math.max(maxInFlight, inFlight)
		try {
			if (gate) await gate
			if (typeof mode === 'number') return { ok: false, status: mode, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }
			const data = files.get(url)
			if (!data) return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }
			if (mode === 'ignore-range' || !range) {
				return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.length) }
			}
			const start = Number(range[1])
			const end = Math.min(Number(range[2]), data.length - 1)
			const slice = data.slice(start, end + 1)
			return {
				ok: true,
				status: 206,
				headers: { get: name => (name.toLowerCase() === 'content-range' ? `bytes ${start}-${end}/${data.length}` : null) },
				arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.length),
			}
		} finally {
			inFlight -= 1
		}
	}
	return { requests, maxInFlight: () => maxInFlight }
}

/** A fake of Discord's `FileModule`: files live in a Map, and every write is recorded. */
function fakeFileModule(initial = {}) {
	const files = new Map(Object.entries(initial))
	const writes = []
	return {
		files,
		writes,
		module: {
			getConstants: () => ({ CacheDirPath: '/data/cache' }),
			readFile: async path => {
				if (!files.has(path)) throw new Error('ENOENT')
				return files.get(path)
			},
			fileExists: async path => files.has(path),
			writeFile: async (directory, relative, data, encoding) => {
				const full = `/data/${directory}/${relative}`
				files.set(full, data)
				writes.push({ directory, relative, data, encoding })
				return full
			},
		},
	}
}

/** Starts the plugin with fake storage for messages, a fake file system, and Flux events that loop back. */
async function setup({ initialFiles = {} } = {}) {
	const messages = new Map()
	const fileSystem = fakeFileModule(initialFiles)
	const runtime = createRuntime({
		loopback: true,
		stores: { MessageStore: { getMessage: (channelId, messageId) => messages.get(`${channelId}:${messageId}`) } },
		overrides: { discord: { native: { FileModule: fileSystem.module } } },
	}).install()
	const { definition } = loadPlugin('nef-viewer')
	const running = await startPlugin(definition, runtime)
	await sleep(10)
	const store = message => {
		messages.set(`${message.channel_id}:${message.id}`, message)
		return message
	}
	const updates = () => runtime.log.dispatched.filter(action => action.type === 'MESSAGE_UPDATE')
	return { runtime, running, fileSystem, store, updates }
}

const rawAttachment = (id, extra = {}) => ({ id, filename: `${id}.NEF`, url: `https://cdn.test/${id}.NEF`, size: 50_000_000, content_type: 'application/octet-stream', ...extra })

;(async () => {
	// --- The whole path: a NEF arrives, is converted, and the message is swapped
	{
		const jpeg = makeJpeg({ width: 6048, height: 4032, exif: true, pad: 5000 })
		const nef = makeNef({ previews: [{ width: 160, height: 120 }, { width: 6048, height: 4032, exif: true, pad: 5000 }] })
		const server = installServer(new Map([['https://cdn.test/a1.NEF', nef]]))
		const s = await setup()
		const message = s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('a1'), { id: 'p1', filename: 'photo.png', url: 'https://cdn.test/photo.png' }] })
		s.runtime.fire('MESSAGE_CREATE', { message })
		check('a new RAW attachment is left alone at first', message.attachments[0].filename === 'a1.NEF' && message.attachments[0].content_type === 'application/octet-stream')
		await sleep(80)

		const written = s.fileSystem.writes.find(write => write.relative === 'nef-viewer/a1.jpg')
		check('the converted JPEG is written to the cache folder as base64', written && written.directory === 'cache' && written.encoding === 'base64', s.fileSystem.writes.map(write => write.relative))
		check('the written bytes are exactly the embedded (largest) preview', written && sameBytes(fromBase64(written.data), jpeg))
		check('only the head of the file is downloaded first (a Range request)', server.requests[0].start === 0 && server.requests[0].end === 256 * 1024 - 1, server.requests[0])
		const swapped = s.updates().find(update => update.message.id === 'm1')
		check('the message is sent through Discord again when the conversion finishes', !!swapped, s.updates())
		const [image, other] = swapped.message.attachments
		check('the RAW attachment becomes a JPEG image attachment', image.filename === 'a1.jpg' && image.content_type === 'image/jpeg', image)
		check('it points at the cached file on the phone', image.url === 'file:///data/cache/nef-viewer/a1.jpg' && image.proxy_url === image.url, image)
		check('it carries the preview size and shape', image.width === 6048 && image.height === 4032 && image.size === jpeg.length, image)
		check('other fields of the attachment are kept', image.id === 'a1' && other.filename === 'photo.png')
		check('other attachments are not touched', other.url === 'https://cdn.test/photo.png')
		const indexWrite = s.fileSystem.writes.filter(write => write.relative === 'nef-viewer/index.json').pop()
		check('an index of finished previews is saved for the next start', indexWrite && indexWrite.encoding === 'utf8' && JSON.parse(indexWrite.data).a1.uri === 'file:///data/cache/nef-viewer/a1.jpg', indexWrite)
	}

	// --- Messages that arrive again after the preview exists are swapped at once
	{
		const nef = makeNef({ previews: [{ width: 4000, height: 3000 }] })
		installServer(new Map([['https://cdn.test/a2.NEF', nef]]))
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('a2')] }) })
		await sleep(80)
		const again = s.runtime.fire('MESSAGE_UPDATE', { message: { id: 'm1', channel_id: 'c1', attachments: [rawAttachment('a2')] } })
		check('a message seen again after conversion is swapped immediately', again.message.attachments[0].filename === 'a2.jpg')
		const list = s.runtime.fire('LOAD_MESSAGES_SUCCESS', { channelId: 'c1', messages: [{ id: 'm9', attachments: [rawAttachment('a2')] }] })
		check('so is a message in a loaded list', list.messages[0].attachments[0].filename === 'a2.jpg')
	}

	// --- Orientation: the preview gets the camera's orientation if it has none
	for (const orientation of [1, 3, 6, 8]) {
		const nef = makeNef({ orientation, previews: [{ width: 6000, height: 4000, exif: false }] })
		installServer(new Map([['https://cdn.test/o.NEF', nef]]))
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('o')] }) })
		await sleep(80)
		const written = s.fileSystem.writes.find(write => write.relative === 'nef-viewer/o.jpg')
		const bytes = written && fromBase64(written.data)
		const hasApp1 = bytes && bytes[2] === 0xff && bytes[3] === 0xe1
		const swapped = s.updates()[0]?.message.attachments[0]
		if (orientation === 1) {
			check('orientation 1 (normal): the preview is written as it is', bytes && sameBytes(bytes, makeJpeg({ width: 6000, height: 4000 })))
		} else {
			check(`orientation ${orientation}: an EXIF block with that orientation is added`, hasApp1 && bytes[31] === orientation, bytes && [...bytes.slice(0, 40)])
		}
		const rotated = orientation >= 5
		check(`orientation ${orientation}: the reported size is ${rotated ? 'turned' : 'unchanged'}`, rotated ? swapped.width === 4000 && swapped.height === 6000 : swapped.width === 6000 && swapped.height === 4000, swapped)
	}
	{
		const nef = makeNef({ orientation: 6, previews: [{ width: 6000, height: 4000, exif: true }] })
		installServer(new Map([['https://cdn.test/e.NEF', nef]]))
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('e')] }) })
		await sleep(80)
		const written = s.fileSystem.writes.find(write => write.relative === 'nef-viewer/e.jpg')
		check('a preview that already has EXIF is left exactly as it is', written && sameBytes(fromBase64(written.data), makeJpeg({ width: 6000, height: 4000, exif: true })))
	}

	// --- TIFF details
	{
		const nef = makeNef({ littleEndian: false, orientation: 6, previews: [{ width: 3000, height: 2000 }] })
		installServer(new Map([['https://cdn.test/be.NEF', nef]]))
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('be')] }) })
		await sleep(80)
		const swapped = s.updates()[0]?.message.attachments[0]
		check('a big-endian (MM) file is read correctly', swapped && swapped.width === 2000 && swapped.height === 3000, swapped)
	}
	{
		const nef = makeNef({ previews: [{ width: 160, height: 120, compression: 7 }, { width: 8000, height: 6000, compression: 1, pad: 40000 }, { width: 6000, height: 4000, compression: 6, pad: 3000 }] })
		installServer(new Map([['https://cdn.test/m.NEF', nef]]))
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('m')] }) })
		await sleep(80)
		const swapped = s.updates()[0]?.message.attachments[0]
		check('of several SubIFDs the largest JPEG wins, and entries that are not JPEG compression are ignored', swapped && swapped.width === 6000 && swapped.height === 4000, swapped)
	}
	{
		const nef = makeNef({ previews: [{ width: 5000, height: 3000, pad: 100 }], junk: 300 * 1024 })
		const server = installServer(new Map([['https://cdn.test/far.NEF', nef]]))
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('far')] }) })
		await sleep(80)
		check('a preview beyond the first 256 KB is fetched with a second Range request', server.requests.length >= 2 && server.requests.some(request => request.start > 256 * 1024), server.requests)
		check('and the whole file is never downloaded', server.requests.every(request => request.end - request.start < nef.length), server.requests)
		check('and the photo still comes out right', s.updates()[0]?.message.attachments[0]?.width === 5000)
	}
	{
		const nef = makeNef({ previews: [{ width: 1200, height: 800 }] })
		installServer(new Map([['https://cdn.test/full.NEF', nef]]), { mode: 'ignore-range' })
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('full')] }) })
		await sleep(80)
		check('a server that ignores Range and sends the whole file still works', s.updates()[0]?.message.attachments[0]?.width === 1200)
	}

	// --- Which attachments count
	{
		installServer(new Map())
		const s = await setup()
		const ones = [
			{ id: 'n1', filename: 'DSC_0001.nrw', url: 'https://cdn.test/n1' },
			{ id: 'n2', filename: 'DSC_0002.nef', url: 'https://cdn.test/n2' },
			{ id: 'n3', filename: 'archive.nef.zip', url: 'https://cdn.test/n3' },
			{ id: 'n4', filename: 'notes.txt', url: 'https://cdn.test/n4' },
			{ id: 'n5', filename: 'DSC_0005.NEF' },
		]
		const requested = []
		globalThis.fetch = async url => {
			requested.push(url)
			return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }
		}
		const warn = console.warn
		console.warn = () => {}
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: ones }) })
		await sleep(50)
		console.warn = warn
		check('.nrw and lowercase .nef are treated as RAW', requested.includes('https://cdn.test/n1') && requested.includes('https://cdn.test/n2'), requested)
		check('.nef.zip, other files and attachments without a link are not', !requested.includes('https://cdn.test/n3') && !requested.includes('https://cdn.test/n4') && requested.length === 2, requested)
	}
	{
		installServer(new Map())
		const s = await setup()
		const plain = { id: 'm1', channel_id: 'c1', attachments: [{ id: 'x', filename: 'a.png', url: 'u' }] }
		const result = s.runtime.fire('MESSAGE_CREATE', { message: plain })
		check('a message without RAW files passes through untouched', result.message === plain && plain.attachments.length === 1 && plain.attachments[0].filename === 'a.png')
		check('messages with no attachments or no message are fine', s.runtime.fire('MESSAGE_CREATE', {}) !== undefined && s.runtime.fire('MESSAGE_CREATE', { message: { id: 'q' } }) !== undefined)
	}

	// --- Forwarded messages: only finished previews are swapped
	{
		const nef = makeNef({ previews: [{ width: 2400, height: 1600 }] })
		installServer(new Map([['https://cdn.test/f.NEF', nef]]))
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('f')] }) })
		await sleep(80)
		const forwarded = s.runtime.fire('MESSAGE_CREATE', { message: { id: 'm2', channel_id: 'c1', attachments: [], message_snapshots: [{ message: { attachments: [rawAttachment('f'), rawAttachment('never-converted')] } }, undefined] } })
		const [done1, pending] = forwarded.message.message_snapshots[0].message.attachments
		check('a forwarded copy of a converted file is swapped', done1.filename === 'f.jpg')
		check('a forwarded file that was never converted is left alone and nothing is queued for it', pending.filename === 'never-converted.NEF')
	}

	// --- Failures
	{
		installServer(new Map([['https://cdn.test/bad.NEF', Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])]]))
		const s = await setup()
		const warnings = []
		const warn = console.warn
		console.warn = (...args) => warnings.push(args.join(' '))
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('bad')] }) })
		await sleep(80)
		console.warn = warn
		check('a file that is not a TIFF is reported and nothing is dispatched', warnings.some(line => line.includes('[nef-viewer]') && line.includes('bad')) && s.updates().length === 0, warnings)
	}
	{
		const server = installServer(new Map(), { mode: 404 })
		const s = await setup()
		const warn = console.warn
		console.warn = () => {}
		const message = s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('gone')] })
		s.runtime.fire('MESSAGE_CREATE', { message })
		await sleep(60)
		const requestsAfterFirst = server.requests.length
		s.runtime.fire('MESSAGE_UPDATE', { message: { id: 'm1', channel_id: 'c1', attachments: [rawAttachment('gone')] } })
		await sleep(60)
		console.warn = warn
		check('a download that fails (HTTP 404) is not retried when the message is seen again', server.requests.length === requestsAfterFirst && requestsAfterFirst >= 1, server.requests.length)
		check('and the attachment stays a plain file', message.attachments[0].filename === 'gone.NEF')
	}
	{
		const nef = makeNef({ previews: [{ width: 800, height: 600 }] })
		installServer(new Map([['https://cdn.test/ok.NEF', nef]]))
		const s = await setup()
		const warn = console.warn
		console.warn = () => {}
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('missing'), rawAttachment('ok')] }) })
		await sleep(100)
		console.warn = warn
		check('one failing file does not stop the others', s.updates().some(update => update.message.attachments.some(attachment => attachment.filename === 'ok.jpg')))
	}

	// --- Duplicates and concurrency
	{
		const nef = makeNef({ previews: [{ width: 800, height: 600 }] })
		const server = installServer(new Map([['https://cdn.test/d.NEF', nef]]))
		const s = await setup()
		const message = s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('d')] })
		s.runtime.fire('MESSAGE_CREATE', { message })
		s.runtime.fire('MESSAGE_UPDATE', { message: { id: 'm1', channel_id: 'c1', attachments: [rawAttachment('d')] } })
		s.runtime.fire('LOAD_MESSAGES_SUCCESS', { channelId: 'c1', messages: [{ id: 'm1', attachments: [rawAttachment('d')] }] })
		await sleep(80)
		const heads = server.requests.filter(request => request.start === 0)
		check('the same attachment seen several times is converted once', heads.length === 1, server.requests)
	}
	{
		let release
		const gate = new Promise(resolve => (release = resolve))
		const files = new Map()
		const ids = ['c1', 'c2', 'c3', 'c4', 'c5']
		for (const id of ids) files.set(`https://cdn.test/${id}.NEF`, makeNef({ previews: [{ width: 800, height: 600 }] }))
		const server = installServer(files, { gate })
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: ids.map(id => rawAttachment(id)) }) })
		await sleep(30)
		check('at most two conversions run at the same time', server.maxInFlight() === 2, server.maxInFlight())
		release()
		await sleep(200)
		check('the queued ones follow as slots free up, and all five finish', s.fileSystem.writes.filter(write => /nef-viewer\/c\d\.jpg$/.test(write.relative)).length === 5, s.fileSystem.writes.map(write => write.relative))
	}

	// --- Cache index from an earlier session
	{
		const cachedUri = 'file:///data/cache/nef-viewer/old.jpg'
		const initial = {
			'/data/cache/nef-viewer/index.json': JSON.stringify({
				old: { uri: cachedUri, width: 3000, height: 2000, size: 1234 },
				lost: { uri: 'file:///data/cache/nef-viewer/lost.jpg', width: 1, height: 1, size: 1 },
			}),
			'/data/cache/nef-viewer/old.jpg': 'jpeg-bytes',
		}
		const server = installServer(new Map())
		const s = await setup({ initialFiles: initial })
		await sleep(20)
		const warn = console.warn
		console.warn = () => {} // the dropped entry is queued again and its download fails, which is logged
		const result = s.runtime.fire('MESSAGE_CREATE', { message: { id: 'm1', channel_id: 'c1', attachments: [rawAttachment('old'), rawAttachment('lost')] } })
		const [restored, missing] = result.message.attachments
		check('previews saved by an earlier session are used straight away, with no download', restored.filename === 'old.jpg' && restored.url === cachedUri && restored.width === 3000 && server.requests.every(request => !request.url.includes('old.NEF')), restored)
		check('an index entry whose file has been deleted is dropped', missing.filename === 'lost.NEF', missing)
		await sleep(30)
		console.warn = warn
	}
	{
		installServer(new Map())
		const s = await setup({ initialFiles: { '/data/cache/nef-viewer/index.json': 'not json' } })
		await sleep(20)
		check('a damaged index file is ignored', s.runtime.fire('MESSAGE_CREATE', { message: { id: 'q', channel_id: 'c1', attachments: [] } }) !== undefined)
	}

	// --- Stopping
	{
		let release
		const gate = new Promise(resolve => (release = resolve))
		const nef = makeNef({ previews: [{ width: 800, height: 600 }] })
		installServer(new Map([['https://cdn.test/s.NEF', nef]]), { gate })
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', attachments: [rawAttachment('s')] }) })
		await sleep(20)
		await s.running.stop()
		check('stopping asks Discord to reload, because drawn messages keep the swapped files', s.running.requests.reload === 1, s.running.requests)
		release()
		await sleep(80)
		check('a conversion that finishes after stopping does not redraw the message', s.updates().length === 0, s.updates())
		const after = s.runtime.fire('MESSAGE_CREATE', { message: { id: 'm2', channel_id: 'c1', attachments: [rawAttachment('s2')] } })
		check('after stopping, messages are no longer rewritten or queued', after.message.attachments[0].filename === 's2.NEF')
	}

	done()
})().catch(error => {
	console.error('CRASH', error)
	process.exit(2)
})
