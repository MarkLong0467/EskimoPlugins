'use strict'

/**
 * Tests for Raw Viewer's picture info: reading metadata from RAW files and JPEGs, the viewer's info layer, the sheet, and
 * the settings. Run with: node tests/raw-viewer.test.cjs (build first, or just run `bun run test`).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Raw Viewer info')

// ---------------------------------------------------------------------------------------------------------------
// Test data: TIFF/EXIF blocks, JPEGs and RAW-shaped files made from scratch
// ---------------------------------------------------------------------------------------------------------------

const le16 = n => [n & 255, (n >> 8) & 255]
const le32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]
const ascii = text => [...Buffer.from(`${text}\0`, 'latin1')]
const rational = (n, d) => [...le32(n), ...le32(d)]

const ascii_ = (tag, text) => ({ tag, type: 2, count: text.length + 1, data: ascii(text) })
const short = (tag, n) => ({ tag, type: 3, count: 1, data: le16(n) })
const long = (tag, n) => ({ tag, type: 4, count: 1, data: le32(n) })
const rationals = (tag, list) => ({ tag, type: 5, count: list.length, data: list.flatMap(([n, d]) => rational(n, d)) })
const pointer = (tag, sub) => ({ tag, type: 4, count: 1, sub })

/** Builds a little endian TIFF structure. An entry with `sub` points to another directory placed after it. */
function buildTiff(ifd0, { magic = 42 } = {}) {
	const out = [0x49, 0x49, ...le16(magic), ...le32(8)]
	const place = entries => {
		const start = out.length
		const sorted = [...entries].sort((a, b) => a.tag - b.tag)
		out.push(...new Array(2 + sorted.length * 12 + 4).fill(0))
		out.splice(start, 2, ...le16(sorted.length))
		sorted.forEach((entry, index) => {
			let value
			if (entry.sub) value = le32(place(entry.sub))
			else if (entry.data.length > 4) {
				if (out.length % 2) out.push(0)
				value = le32(out.length)
				out.push(...entry.data)
			} else value = [...entry.data, 0, 0, 0, 0].slice(0, 4)
			out.splice(start + 2 + index * 12, 12, ...le16(entry.tag), ...le16(entry.type), ...le32(entry.count), ...value)
		})
		return start
	}
	place(ifd0)
	return Uint8Array.from(out)
}

const GPS = [
	ascii_(1, 'N'),
	rationals(2, [[44, 1], [4, 1], [1500, 100]]),
	ascii_(3, 'W'),
	rationals(4, [[92, 1], [43, 1], [3000, 100]]),
]

const PHOTO = [
	ascii_(0x010f, 'NIKON CORPORATION'),
	ascii_(0x0110, 'NIKON Z 8'),
	short(0x0112, 6),
	pointer(0x8769, [
		rationals(0x829a, [[1, 250]]),
		rationals(0x829d, [[18, 10]]),
		short(0x8827, 400),
		ascii_(0x9003, '2026:11:04 15:35:09'),
		ascii_(0x9011, '-06:00'),
		rationals(0x920a, [[24, 1]]),
		ascii_(0xa434, 'NIKKOR Z 24-70mm f/2.8 S'),
		long(0xa002, 8256),
		long(0xa003, 5504),
	]),
	pointer(0x8825, GPS),
]

/** A JPEG with an Exif segment holding the given TIFF bytes. */
function jpegWithExif(tiff) {
	const body = [...Buffer.from('Exif\0\0'), ...tiff]
	const length = body.length + 2
	return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, (length >> 8) & 255, length & 255, ...body, 0xff, 0xd9])
}

const plainJpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xfe, 0, 4, 65, 65, 0xff, 0xd9])

function sofJpeg(width, height, pad = 0) {
	return Uint8Array.from([0xff, 0xd8, ...(pad ? [0xff, 0xfe, (pad + 2) >> 8, (pad + 2) & 255, ...new Array(pad).fill(65)] : []), 0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
}

// ---------------------------------------------------------------------------------------------------------------
// A fake server with Range support
// ---------------------------------------------------------------------------------------------------------------

function installServer(files) {
	const requests = []
	globalThis.fetch = async (url, options = {}) => {
		const range = /bytes=(\d+)-(\d+)/.exec(options.headers?.Range ?? '')
		requests.push({ url, method: options.method ?? 'GET', start: range ? Number(range[1]) : null })
		const data = files.get(url)
		if (!data) return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }
		const start = range ? Number(range[1]) : 0
		const end = range ? Math.min(Number(range[2]), data.length - 1) : data.length - 1
		const slice = data.slice(start, end + 1)
		return {
			ok: true,
			status: range ? 206 : 200,
			headers: { get: name => (name.toLowerCase() === 'content-range' ? `bytes ${start}-${end}/${data.length}` : null) },
			arrayBuffer: async () => slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.length),
		}
	}
	return { requests }
}

async function setup(saved, messages = new Map()) {
	const writes = []
	const runtime = createRuntime({
		loopback: true,
		stores: { MessageStore: { getMessage: (c, m) => messages.get(c + ':' + m) } },
		overrides: { discord: { native: { FileModule: { getConstants: () => ({ CacheDirPath: '/data/cache' }), readFile: async () => { throw new Error('ENOENT') }, fileExists: async () => false, writeFile: async (d, r, data) => { writes.push({ r, data }); return '/data/' + d + '/' + r } } } } },
	}).install()
	runtime.valenced.react.ReactNative.useWindowDimensions = () => ({ height: 800 })
	const overlay = function MediaModalOverlay(props) {
		return runtime.React.createElement('Overlay', { source: props.source })
	}
	const shareModule = { useMediaShareActions: () => [{ label: 'Save', IconComponent: 1, action() {} }] }
	runtime.finders.loadModule(shareModule)
	const viewer = { default: overlay }
	runtime.finders.loadModule(viewer)
	const { definition } = loadPlugin('nef-viewer')
	const storage = runtime.makeStorage(saved)
	const running = await startPlugin(definition, runtime, { storage })
	await sleep(10)
	const draw = props => {
		const view = runtime.mount(runtime.React.createElement(viewer.default, props))
		return view
	}
	const opened = () => runtime.log.actions.filter(a => a.label === 'actionSheet' && a.name === 'openLazy' && a.args[1] === 'marklong.raw-viewer.info')
	return { runtime, running, definition, storage, draw, opened, writes, shareModule, jsx: globalThis.valenced.react.ReactJSXRuntime }
}

const source = { uri: 'https://media.discordapp.net/attachments/1/2/photo.jpg?width=800&height=600', sourceURI: 'https://cdn.test/photo.jpg?ex=1&hm=2', filename: 'photo.jpg', width: 8256, height: 5504, contentType: 'image/jpeg' }

;(async () => {
	// --- The info layer in the viewer
	{
		const jpeg = jpegWithExif(buildTiff(PHOTO))
		const server = installServer(new Map([['https://cdn.test/photo.jpg?ex=1&hm=2', jpeg]]))
		const s = await setup()
		const view = s.draw({ source })
		check('the viewer is still drawn', !!findNode(view.tree, n => n.type === 'Overlay'), view.tree)
		const button = findNode(view.tree, n => n.props?.accessibilityLabel === 'Picture info')
		check('every picture gets an info button', !!button)
		check('and a swipe handle', !!findNode(view.tree, n => n.props?.onStartShouldSetPanResponder !== undefined || n.props?.onMoveShouldSetPanResponder !== undefined || n.props?.onResponderRelease !== undefined || n.props?.onResponderMove !== undefined))

		button.props.onPress()
		check('tapping the button opens the info sheet', s.opened().length === 1, s.runtime.log.actions)

		const Sheet = (await s.opened()[0].args[0]).default
		const sheet = s.runtime.mount(s.runtime.React.createElement(Sheet, {}))
		await sleep(60)
		await sheet.settle()
		const text = JSON.stringify(sheet.tree)
		check('the sheet reads the original picture, not the resized copy', server.requests.every(r => r.url === 'https://cdn.test/photo.jpg?ex=1&hm=2'), server.requests)
		check('it shows when the picture was taken', text.includes('Wed, Nov 4, 2026 • 3:35 PM GMT-06:00'), text.slice(0, 300))
		check('it shows the camera', text.includes('NIKON Z 8') && !text.includes('NIKON CORPORATION NIKON Z 8'))
		check('it shows the lens and the settings', text.includes('NIKKOR Z 24-70mm f/2.8 S') && text.includes('1/250 s • ƒ/1.8 • 24 mm • ISO 400'))
		check('it shows the coordinates', text.includes('44.0708, -92.7250'), text.slice(0, 400))
		const mapRow = findNode(sheet.tree, n => n.type === 'Design.TableRow' && n.props.label === '44.0708, -92.7250')
		check('the coordinates open Google Maps', !!mapRow && typeof mapRow.props.onPress === 'function')
		mapRow.props.onPress()
		check('with the place in the link', (globalThis.__opened ?? []).some(url => url.includes('google.com/maps') && url.includes('44.070833,-92.725000')), globalThis.__opened)
	}

	// --- A picture without metadata, and a file that cannot be read
	{
		installServer(new Map([['https://cdn.test/plain.jpg', plainJpeg]]))
		const s = await setup()
		const view = s.draw({ source: { ...source, sourceURI: 'https://cdn.test/plain.jpg', filename: 'plain.jpg' } })
		findNode(view.tree, n => n.props?.accessibilityLabel === 'Picture info').props.onPress()
		const Sheet = (await s.opened()[0].args[0]).default
		const sheet = s.runtime.mount(s.runtime.React.createElement(Sheet, {}))
		await sleep(60)
		await sheet.settle()
		check('a picture with no metadata says so', JSON.stringify(sheet.tree).includes('This picture has no metadata.'))
		check('and shows no map', !findNode(sheet.tree, n => n.type === 'Image'))
	}

	// --- Videos and other files get no layer
	{
		installServer(new Map())
		const s = await setup()
		const video = s.draw({ source: { ...source, contentType: 'video/mp4', videoURI: 'https://cdn.test/v.mp4' } })
		check('a video gets no info button', !findNode(video.tree, n => n.props?.accessibilityLabel === 'Picture info'))
		const file = s.draw({ source: { uri: 'https://cdn.test/a.txt', filename: 'a.txt', contentType: 'text/plain' } })
		check('nor does a file that is not a picture', !findNode(file.tree, n => n.props?.accessibilityLabel === 'Picture info'))
	}

	// --- Settings
	{
		installServer(new Map())
		const s = await setup({ infoButton: false })
		const view = s.draw({ source })
		check('the info button can be turned off', !findNode(view.tree, n => n.props?.accessibilityLabel === 'Picture info'))
		check('and the handle stays', !!findNode(view.tree, n => /Swipe up/.test(JSON.stringify(n.props?.children ?? ''))))
		const settings = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		const switches = findNodes(settings.tree, n => n.type === 'Design.TableSwitchRow')
		check('the settings have a switch for each feature', switches.map(n => n.props.label).join('|') === 'Show RAW files as photos|Render only when I ask|Info button|Swipe up for info|Map preview', switches.map(n => n.props.label))
		check('and show a turned off one as off', switches.find(n => n.props.label === 'Info button').props.value === false)
	}



	// --- RAW formats other than Nikon
	{
		const jpeg = sofJpeg(6000, 4000, 300)
		const raf = new Uint8Array(200 + jpeg.length)
		raf.set(Buffer.from('FUJIFILMCCD-RAW 0201FF129503'))
		new DataView(raf.buffer).setUint32(84, 200)
		new DataView(raf.buffer).setUint32(88, jpeg.length)
		raf.set(jpeg, 200)
		// A Canon CR3-like file: no TIFF at the start, a JPEG somewhere inside.
		const cr3 = new Uint8Array(3000 + jpeg.length)
		cr3.set(Buffer.from('ftypcrx '), 4)
		cr3.set(sofJpeg(160, 120), 500)
		cr3.set(jpeg, 3000)
		installServer(new Map([['https://cdn.test/f.RAF', raf], ['https://cdn.test/c.CR3', cr3]]))
		const s = await setup()
		const attachment = (id, ext) => ({ id, filename: id + '.' + ext, url: 'https://cdn.test/' + id + '.' + ext, size: 99 })
		const message = { id: 'm1', channel_id: 'c1', attachments: [attachment('f', 'RAF'), attachment('c', 'CR3')] }
		s.runtime.fire('MESSAGE_CREATE', { message })
		await sleep(100)
		const photo = id => s.writes.find(w => w.r === 'nef-viewer/' + id + '.jpg')
		check('a Fujifilm RAF is turned into its preview', photo('f') && Buffer.from(photo('f').data, 'base64').equals(Buffer.from(jpeg)), s.writes.map(w => w.r))
		check('a Canon CR3 is turned into its largest preview', photo('c') && Buffer.from(photo('c').data, 'base64').equals(Buffer.from(jpeg)), s.writes.map(w => w.r))
	}


	// --- The viewer's three dots menu
	{
		installServer(new Map())
		const s = await setup()
		const items = s.shareModule.useMediaShareActions({ source })
		check('the viewer menu gets Photo info after its own items', items.map(i => i.label).join('|') === 'Save|Photo info', items.map(i => i.label))
		items.at(-1).action()
		check('choosing it opens the info sheet', s.opened().length === 1)
		check('a video gets no menu item', s.shareModule.useMediaShareActions({ source: { ...source, contentType: 'video/mp4' } }).length === 1)
	}

	// --- Render only when asked
	{
		const nef = Uint8Array.from(buildTiff([short(0x0112, 1), ascii_(0x010f, 'NIKON')]))
		const server = installServer(new Map([['https://cdn.test/a1.NEF', nef]]))
		const message = { id: 'm1', channel_id: 'c1', attachments: [{ id: 'a1', filename: 'a1.NEF', url: 'https://cdn.test/a1.NEF', size: 5 }] }
		const s = await setup({ renderOnDemand: true }, new Map([['c1:m1', message]]))
		s.runtime.fire('MESSAGE_CREATE', { message })
		await sleep(50)
		check('with render only when asked, a RAW file is not downloaded', server.requests.length === 0, server.requests)
		const row = label => ({ type: 'MenuRow', props: { label, onPress() {} } })
		s.jsx.jsx('MessageActionsSheet', { message })
		const group = s.jsx.jsx('Group', { children: [row('Copy Text'), row('Reply')] })
		const labels = group.props.children.map(r => r.props.label)
		check('holding the message adds Render RAW photo', labels.at(-1) === 'Render RAW photo', labels)
		group.props.children.at(-1).props.onPress()
		await sleep(80)
		check('tapping it starts the download', server.requests.length > 0, server.requests)

		const other = { id: 'm2', channel_id: 'c1', attachments: [{ id: 'p', filename: 'p.png', url: 'https://cdn.test/p.png' }] }
		s.jsx.jsx('MessageActionsSheet', { message: other })
		check('a message without RAW files gets no such row', s.jsx.jsx('Group', { children: [row('Copy Text'), row('Reply')] }).props.children.length === 2)
	}
	{
		const s = await setup({ renderOnDemand: false })
		const message = { id: 'm1', channel_id: 'c1', attachments: [{ id: 'a1', filename: 'a1.NEF', url: 'https://cdn.test/a1.NEF' }] }
		s.jsx.jsx('MessageActionsSheet', { message })
		check('with the setting off there is no row', s.jsx.jsx('Group', { children: [{ type: 'MenuRow', props: { label: 'Copy Text', onPress() {} } }, { type: 'MenuRow', props: { label: 'Reply', onPress() {} } }] }).props.children.length === 2)
	}

	done()
})()
