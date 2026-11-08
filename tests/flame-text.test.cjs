'use strict'

/** Tests for Flame Text. Run with: node tests/flame-text.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Flame Text')

const COMMAND_ID = '-731002'

/** Discord's built-in commands. */
function fakeBuiltIns() {
	const dice = { id: '-18', untranslatedName: 'roll-dice', displayName: 'roll-dice', type: 1, inputType: 0, applicationId: '-1' }
	const items = [dice]
	return { items, getBuiltInCommands: (types, all) => (all || types.includes(1) ? items : []) }
}

/** Discord's message module, which remembers what it was asked to send. */
function fakeMessages() {
	const sent = []
	return { sent, sendMessage: (channelId, message, clear, options) => (sent.push({ channelId, message, clear, options }), Promise.resolve('sent')), receiveMessage() {}, revealMessage() {} }
}

/** Discord's file code: it keeps what it was asked to write and answers with a file address like Android's. */
function fakeFiles(extra = {}) {
	const written = []
	return {
		written,
		writeFile: async (folder, path, data, encoding) => {
			written.push({ folder, path, data, encoding })
			return `file:/cache/${path}`
		},
		moveFile() {},
		removeFile() {},
		...extra,
	}
}

/** Discord's upload object: it keeps what it was made from. */
function fakeUploads() {
	const made = []
	class CloudUpload {
		constructor(item, channelId) {
			this.item = item
			this.channelId = channelId
			made.push(this)
		}
	}
	return { made, CloudUpload }
}

const start = async (saved = {}, extra = {}) => {
	const builtIns = extra.builtIns ?? fakeBuiltIns()
	const messages = extra.messages ?? fakeMessages()
	const files = extra.files ?? fakeFiles()
	const uploads = extra.uploads ?? fakeUploads()
	const s = await startPort('flame-text', {
		saved: { defaultsSeen: true, commandOffSeen: true, command: true, size: 'medium', background: 'dark', ...saved },
		reactExtras: true,
		stores: extra.stores,
		before: runtime => {
			const load = runtime.valenced.modules.finders.loadModule
			load(builtIns)
			load(messages)
			if (!extra.noFiles) load(files)
			if (!extra.noUploads) {
				load(uploads)
				load({ UploadPlatform: { REACT_NATIVE: 0, WEB: 1 } })
			}
		},
	})
	let last
	const mountSettings = s.mountSettings
	return Object.assign(s, {
		builtIns,
		messages,
		files,
		uploads,
		mountSettings: async (...args) => {
			last?.unmount()
			last = await mountSettings(...args)
			return last
		},
	})
}

const flameOf = list => list.find(item => item.id === COMMAND_ID)
const switchRow = (view, label) => findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === label)
const draw = (s, type, props) => s.runtime.valenced.react.ReactJSXRuntime.jsx(type, props)

/** Sends a message the way the chat box does and waits until the plugin has finished with it. */
async function say(s, content, options = {}, extra = {}) {
	const before = s.messages.sent.length
	const result = s.messages.sendMessage('chan1', { content, nonce: 'n', ...extra }, false, options)
	await result
	await sleep(5)
	return s.messages.sent.slice(before)
}

/** Waits until something is true, for work the plugin does in the background. */
async function until(test, ms = 6000) {
	const end = Date.now() + ms
	while (Date.now() < end) {
		if (test()) return true
		await sleep(25)
	}
	return test()
}

/** Reads base64 into bytes. */
const bytesOf = text => Uint8Array.from(Buffer.from(text, 'base64'))

/** Reads a GIF made by the plugin with an independent decoder: size, colours, and every picture's pixels. */
function readGif(bytes) {
	const text = String.fromCharCode(...bytes.subarray(0, 6))
	if (text !== 'GIF89a') throw new Error(`header ${text}`)
	const width = bytes[6] | (bytes[7] << 8)
	const height = bytes[8] | (bytes[9] << 8)
	const colours = 2 << (bytes[10] & 7)
	let at = 13 + colours * 3
	const frames = []
	let transparent = -1
	let loops = false
	let delay = 0
	while (at < bytes.length) {
		const kind = bytes[at++]
		if (kind === 0x3b) return { width, height, colours, frames, transparent, loops, delay, ended: true }
		if (kind === 0x21) {
			const label = bytes[at++]
			if (label === 0xf9) {
				const flags = bytes[at + 1]
				delay = bytes[at + 2] | (bytes[at + 3] << 8)
				if (flags & 1) transparent = bytes[at + 4]
			}
			if (label === 0xff) loops = String.fromCharCode(...bytes.subarray(at + 1, at + 12)) === 'NETSCAPE2.0'
			for (;;) {
				const size = bytes[at++]
				if (size === 0) break
				at += size
			}
			continue
		}
		if (kind !== 0x2c) throw new Error(`unknown block ${kind} at ${at}`)
		at += 9
		const minimum = bytes[at++]
		const data = []
		for (;;) {
			const size = bytes[at++]
			if (size === 0) break
			for (let i = 0; i < size; i++) data.push(bytes[at + i])
			at += size
		}
		frames.push(lzwDecode(data, minimum, width * height))
	}
	return { width, height, colours, frames, transparent, loops, delay, ended: false }
}

/** The GIF squeezing, undone. */
function lzwDecode(data, minimum, count) {
	const clear = 1 << minimum
	const end = clear + 1
	const out = new Uint8Array(count)
	let written = 0
	let table = []
	let bits = minimum + 1
	let buffer = 0
	let held = 0
	let read = 0
	let previous = null
	const reset = () => {
		table = []
		for (let i = 0; i < clear; i++) table[i] = [i]
		table[clear] = []
		table[end] = []
		bits = minimum + 1
		previous = null
	}
	reset()
	while (written < count) {
		while (held < bits && read < data.length) {
			buffer |= data[read++] << held
			held += 8
		}
		if (held < bits) throw new Error('data ended early')
		const code = buffer & ((1 << bits) - 1)
		buffer >>>= bits
		held -= bits
		if (code === clear) {
			reset()
			continue
		}
		if (code === end) break
		let entry
		if (code < table.length) entry = table[code]
		else if (previous) entry = [...previous, previous[0]]
		else throw new Error('bad code')
		for (const value of entry) if (written < count) out[written++] = value
		if (previous) table.push([...previous, entry[0]])
		previous = entry
		if (table.length === 1 << bits && bits < 12) bits++
	}
	if (written !== count) throw new Error(`decoded ${written} of ${count}`)
	return out
}

/** Whether two pictures differ anywhere. */
const differ = (a, b) => a.some((value, i) => value !== b[i])

/** What a send put in front of Discord: the GIF it wrote. */
const gifOf = s => readGif(bytesOf(s.files.written.at(-1).data))

;(async () => {
	// --- Off: nothing changes
	{
		const s = await start()
		const sent = await say(s, 'hello there')
		check('with the switch off a message goes out as written', sent.length === 1 && sent[0].message.content === 'hello there' && !sent[0].options.attachmentsToUpload)
		check('and nothing is drawn or saved', s.files.written.length === 0 && s.uploads.made.length === 0)
		check('every wrapper returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
	}

	// --- On: the message becomes a GIF
	{
		const s = await start({ on: true })
		const sent = await say(s, 'Hello World', {}, { tts: false })
		check('one message is sent', sent.length === 1, sent.length)
		const message = sent[0]
		check('it has no text, the GIF is the message', message.message.content === '')
		check('it keeps what Discord put in the message', message.message.nonce === 'n' && message.message.tts === false)
		check('it goes to the same chat and does not clear the draft', message.channelId === 'chan1' && message.clear === false)
		const attached = message.options.attachmentsToUpload
		check('the GIF is attached as an upload', Array.isArray(attached) && attached.length === 1 && attached[0] === s.uploads.made[0])
		check('the upload is told the chat', attached[0].channelId === 'chan1')
		const item = attached[0].item
		check('it is a GIF with a name and the file address Discord gave', item.mimeType === 'image/gif' && item.filename === 'flame.gif' && item.uri === item.originalUri && /^file:\/cache\/flame-.*\.gif$/.test(item.uri), item)
		check('it carries the platform number and the picture size', item.platform === 0 && item.width > 100 && item.height > 50, item)
		check('it was saved in Discord’s cache folder as base64', s.files.written.length === 1 && s.files.written[0].folder === 'cache' && s.files.written[0].encoding === 'base64' && s.files.written[0].path.endsWith('.gif'))
		const gif = gifOf(s)
		check('the file is a complete GIF that plays over and over', gif.ended && gif.loops && gif.colours === 256)
		check('its size is what the upload says', gif.width === item.width && gif.height === item.height, [gif.width, gif.height, item])
		check('it has eight pictures that all decode', gif.frames.length === 8 && gif.frames.every(f => f.length === gif.width * gif.height))
		check('the flames move: the pictures are not the same', differ(gif.frames[0], gif.frames[3]) && differ(gif.frames[0], gif.frames[7]))
		check('it shows each picture for a short time', gif.delay > 0 && gif.delay < 20)
		const ink = gif.frames[0].filter(v => v % 8 === 7 && v >= 8 * 5).length
		check('the letters and flames fill part of it and the background the rest', ink > gif.width * gif.height * 0.05 && ink < gif.width * gif.height * 0.9, ink)
		check('the text is not in the message or the file name', !/Hello/.test(JSON.stringify(message.message)) && !/Hello/.test(item.filename))
		s.stop()
		check('no errors', s.errors.length === 0, s.errors)
	}

	// --- Same words, same GIF; different words, different GIF
	{
		const s = await start({ on: true })
		await say(s, 'Burn')
		await say(s, 'Burn')
		await say(s, 'Different')
		const [a, b, c] = s.files.written.map(f => f.data)
		check('the same words always burn the same way', a === b)
		check('other words make another GIF', a !== c)
		s.stop()
	}

	// --- Looks
	{
		const s = await start({ on: true, background: 'transparent', motion: 'off' })
		await say(s, 'Hi')
		const gif = gifOf(s)
		check('a see-through GIF has one see-through colour', gif.transparent === 0 && gif.frames.length === 1)
		check('and the picture has see-through pixels around the flames', gif.frames[0].filter(v => v === 0).length > gif.width * gif.height * 0.2)
		s.stop()
	}
	for (const [motion, count] of [['off', 1], ['light', 6], ['normal', 8], ['smooth', 12]]) {
		const s = await start({ on: true, motion })
		await say(s, 'Hi')
		check(`movement ${motion} makes ${count} picture(s)`, gifOf(s).frames.length === count)
		s.stop()
	}
	{
		const sizes = {}
		for (const size of ['small', 'medium', 'large']) {
			const s = await start({ on: true, size, motion: 'off' })
			await say(s, 'Size')
			const gif = gifOf(s)
			sizes[size] = gif.width
			s.stop()
		}
		check('bigger sizes make bigger pictures', sizes.small < sizes.medium && sizes.medium < sizes.large, sizes)
	}
	{
		const looks = {}
		for (const style of ['fire', 'blue', 'green', 'purple']) {
			const s = await start({ on: true, style, motion: 'off' })
			await say(s, 'Hue')
			looks[style] = s.files.written[0].data
			s.stop()
		}
		check('each fire colour makes its own GIF', new Set(Object.values(looks)).size === 4)
	}
	{
		const s = await start({ on: true, motion: 'off', background: 'white' })
		await say(s, 'x'.repeat(40))
		const gif = gifOf(s)
		check('long text is wrapped onto lines and kept inside the width limit', gif.width <= 1100 && gif.height > 200, [gif.width, gif.height])
		s.stop()
	}

	// --- Any length: a paragraph is wrapped like text
	{
		const s = await start({ on: true, motion: 'off' })
		const paragraph = 'The quick brown fox jumps over the lazy dog and keeps running through the field until the sun goes down. '.repeat(3).trim()
		const sent = await say(s, paragraph)
		const gif = gifOf(s)
		check('a paragraph of 300 letters is burned, with no length limit', sent[0].options.attachmentsToUpload?.length === 1 && sent[0].message.content === '')
		check('it is wrapped into many lines and stays inside the width limit', gif.width <= 1100 && gif.height > 400, [gif.width, gif.height])
		check('long text does not need to be short to be wrapped on spaces', s.files.written.length === 1)
		const huge = await say(s, 'word '.repeat(700))
		check('only a message whose picture would be too big is sent as text', huge[0].message.content.startsWith('word') && !huge[0].options.attachmentsToUpload)
		s.stop()
	}

	// --- Caption
	{
		const s = await start({ on: true, caption: true })
		const sent = await say(s, 'Say this')
		check('with the text option the words go with the GIF', sent[0].message.content === 'Say this' && sent[0].options.attachmentsToUpload.length === 1)
		s.stop()
	}

	// --- Messages that stay text
	{
		const s = await start({ on: true })
		const cases = [
			['a link', 'look https://example.com now', 'link', {}],
			['a bare web address', 'see www.example.com', 'link', {}],
			['code', 'use `npm i` here', 'code', {}],
			['a code block', '```js\nx\n```', 'code', {}],
			['a mention', 'hi <@123456>', 'special', {}],
			['a custom emoji', 'wow <:cool:123>', 'special', {}],
			['a timestamp', 'at <t:1794000000:F>', 'special', {}],
			['@everyone', '@everyone hi', 'special', {}],
			['an emoji', 'hi 😀', 'unsupported', {}],
			['another alphabet', 'привет', 'unsupported', {}],
			['a file already attached', 'photo', 'attachment', { attachmentsToUpload: [{}] }],
			['nothing but spaces', '   ', 'empty', {}],
		]
		for (const [what, text, reason, options] of cases) {
			const sent = await say(s, text, options)
			check(`${what} is sent as the text it was`, sent.length === 1 && sent[0].message.content === text && sent[0].options.attachmentsToUpload === options.attachmentsToUpload, sent[0])
		}
		const sticker = await say(s, 'stick', {}, { stickerIds: ['1'] })
		check('a message with a sticker is sent as it was', sticker[0].message.content === 'stick' && !sticker[0].options.attachmentsToUpload)
		check('none of those wrote a file', s.files.written.length === 0)
		const view = await s.mountSettings()
		button(view, 'Copy logs').props.onPress()
		const report = s.copied.at(-1)
		check('the report counts them by reason without showing the words', /sent as plain text on purpose: /.test(report) && ['link 2', 'code 2', 'special 4', 'unsupported 2', 'attachment 1', 'sticker 1', 'empty 1'].every(part => report.includes(part)) && !/example\.com|npm i|привет/.test(report), report)
		s.stop()
	}
	{
		const s = await start({ on: true })
		const accents = await say(s, 'Café señor')
		check('accents are dropped and the text is still burned', accents[0].options.attachmentsToUpload?.length === 1)
		const quotes = await say(s, 'it’s “fine” – ok…')
		check('curly quotes and dashes are drawn as plain ones', quotes[0].options.attachmentsToUpload?.length === 1)
		const lines = await say(s, 'one\ntwo')
		check('a line break makes a new line', lines[0].options.attachmentsToUpload?.length === 1 && gifOf(s).height > 250)
		s.stop()
	}

	// --- When something goes wrong the plain text is sent
	{
		const s = await start({ on: true }, { files: fakeFiles({ writeFile: async () => { throw new Error('disk full') } }) })
		const sent = await say(s, 'save me')
		check('if the GIF cannot be saved the text is sent instead', sent.length === 1 && sent[0].message.content === 'save me' && !sent[0].options.attachmentsToUpload, sent)
		check('and a toast says so', s.toasts().some(t => /sent as text/.test(t ?? '')), s.toasts())
		const view = await s.mountSettings()
		check('the status on the settings screen says the last GIF did not work', /did not work/.test(textOf(view.tree)) && /disk full/.test(textOf(view.tree)))
		button(view, 'Copy logs').props.onPress()
		const report = s.copied.at(-1)
		check('the report names the step and the problem but not the words', /Last problem: saving the GIF: disk full/.test(report) && /plain text because the GIF failed: 1/.test(report) && !/save me/.test(report), report)
		s.stop()
	}
	{
		const uploads = { made: [], CloudUpload: class { constructor() { throw new Error('bad item') } } }
		const s = await start({ on: true }, { uploads })
		const sent = await say(s, 'upload me')
		check('if the upload object fails the text is sent instead', sent.length === 1 && sent[0].message.content === 'upload me' && !sent[0].options.attachmentsToUpload)
		s.stop()
	}
	{
		const s = await start({ on: true }, { noFiles: true, noUploads: true })
		const sent = await say(s, 'nothing found')
		check('if Discord’s upload code is not found the text is sent instead', sent.length === 1 && sent[0].message.content === 'nothing found')
		const view = await s.mountSettings()
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const failed = findNodes(view.tree, n => n.type === 'Design.TableRow' && /^✗/.test(n.props.label ?? '')).map(n => n.props.label)
		check('the self-check says which part is missing', failed.some(c => /file code/.test(c)) && failed.some(c => /upload object/.test(c)), failed)
		s.stop()
	}
	{
		const messages = fakeMessages()
		let calls = 0
		messages.sendMessage = (channelId, message, clear, options) => {
			calls++
			messages.sent.push({ channelId, message, clear, options })
			return options?.attachmentsToUpload ? Promise.reject(new Error('rejected')) : Promise.resolve('ok')
		}
		const s = await start({ on: true }, { messages })
		let caught
		try {
			await messages.sendMessage('chan1', { content: 'boom' }, false, {})
		} catch (error) {
			caught = error
		}
		check('a send that Discord refuses is not sent a second time as text', calls === 1 && caught?.message === 'rejected', calls)
		s.stop()
	}
	{
		// Discord reporting a refused upload
		const s = await start({ on: true })
		const sent = await say(s, 'too big')
		sent[0].options.onAttachmentUploadError({}, 40005, 'too large')
		check('a refused upload is told to the person and noted', s.toasts().some(t => /did not take/.test(t ?? '')))
		s.stop()
	}

	// --- /flame
	{
		const s = await start()
		const all = s.builtIns.getBuiltInCommands([1], true, false)
		const cmd = flameOf(all)
		check('/flame is added to the built-in commands', !!cmd && all.length === 2)
		check('it is a built-in command like Discord’s', cmd.applicationId === '-1' && cmd.untranslatedName === 'flame' && cmd.displayName === 'flame' && cmd.type === 1 && cmd.inputType === 0, cmd)
		check('it has one optional text option', cmd.options.length === 1 && cmd.options[0].name === 'text' && cmd.options[0].type === 3 && !cmd.options[0].required)
		check('asking again gives the same list', s.builtIns.getBuiltInCommands([1], true, false) === all)
		check('Discord’s own list is not changed', s.builtIns.items.length === 1)
		const result = cmd.execute([], { channel: { id: 'chan1' } })
		check('running it with no text sends nothing', result === undefined && s.messages.sent.length === 0)
		check('and switches flame text on', s.storage.cache.on === true)
		check('with a toast', s.toasts().some(t => /Flame text is on/.test(t ?? '')), s.toasts())
		cmd.execute([], { channel: { id: 'chan1' } })
		check('running it again switches it off', s.storage.cache.on === false && s.toasts().some(t => t === 'Flame text is off'))
		s.stop()
		check('turning the plugin off takes it out', !flameOf(s.builtIns.getBuiltInCommands([1], true, false)))
	}
	{
		const s = await start({ command: false })
		check('with the command switched off it is not in the list', !flameOf(s.builtIns.getBuiltInCommands([1], true, false)))
		const view = await s.mountSettings()
		switchRow(view, '/flame command').props.onValueChange(true)
		await sleep(5)
		check('switching it on adds it', !!flameOf(s.builtIns.getBuiltInCommands([1], true, false)))
		s.stop()
	}
	{
		// /flame text sends one GIF whether the switch is on or not, and leaves the switch alone
		const s = await start()
		const cmd = flameOf(s.builtIns.getBuiltInCommands([1], true, false))
		cmd.execute([{ name: 'text', value: 'one shot' }], { channel: { id: 'chan7' } })
		await until(() => s.messages.sent.length >= 1)
		check('/flame with text sends it as a GIF to that chat', s.messages.sent.length === 1 && s.messages.sent[0].channelId === 'chan7' && s.messages.sent[0].options.attachmentsToUpload?.length === 1, s.messages.sent)
		check('the GIF was not turned into a GIF twice', s.files.written.length === 1)
		check('and the switch stays off', s.storage.cache.on !== true)
		cmd.execute([{ name: 'text', value: 'see https://example.com' }], { channel: { id: 'chan7' } })
		await sleep(20)
		check('text that cannot be drawn is not sent and the person is told', s.messages.sent.length === 1 && s.toasts().some(t => /link/.test(t ?? '')), s.toasts())
		cmd.execute([{ name: 'text', value: 'x'.repeat(80) }], { channel: { id: 'chan7' } })
		await until(() => s.messages.sent.length >= 2)
		check('a long /flame text is wrapped', s.messages.sent.length === 2)
		s.stop()
	}

	// --- The Flame Typing row in the + menu
	{
		const s = await start()
		const jsx = s.runtime.valenced.react.ReactJSXRuntime.jsx
		const menu = () => ({ items: [
			{ label: 'Camera', id: 'cam', key: 'cam', action() {}, iconSource: 1 },
			{ label: 'Photos', id: 'pho', key: 'pho', action() {}, iconSource: 2 },
			{ label: 'Poll', id: 'pol', key: 'pol', action() {}, iconSource: 3 },
		] })
		const element = jsx('ActionSheet', menu())
		const labels = element.props.items.map(i => i.label)
		check('the + menu gets a Flame Typing row at the end that says it is off', labels.join() === 'Camera,Photos,Poll,Flame Typing: Off', labels)
		const row = element.props.items[3]
		check('the row does not keep the identity of the row it was copied from', row.id === undefined && row.key === undefined && typeof row.action === 'function')
		row.action()
		check('tapping it switches flame text on', s.storage.cache.on === true)
		check('and the menu is closed', s.runtime.log.actions.some(a => a.label === 'actionSheet' && a.name === 'hideAllActionSheets'))
		const again = jsx('ActionSheet', element.props)
		check('the row says it is on next time, and is not added twice', again.props.items.map(i => i.label).join() === 'Camera,Photos,Poll,Flame Typing: On', again.props.items.map(i => i.label))
		await sleep(700)
		again.props.items[3].action()
		check('tapping it again switches it off', s.storage.cache.on === false)
		const other = jsx('ActionSheet', { items: [{ label: 'Block', action() {} }, { label: 'Mute', action() {} }] })
		check('a menu that is not the + menu is left alone', other.props.items.length === 2)
		const plain = jsx('View', { children: 'x' })
		check('an element without items is left alone', plain.props.children === 'x')
		s.storage.set({ button: false })
		check('with the setting off nothing is added', jsx('ActionSheet', menu()).props.items.length === 3)
		s.stop()
		check('turning the plugin off puts the menu back', jsx('ActionSheet', menu()).props.items.length === 3)
		check('no errors', s.errors.length === 0, s.errors)
	}
	{
		const fresh = await startPort('flame-text', { saved: {}, reactExtras: true })
		check('/flame is off by default', fresh.storage.cache.command !== true, fresh.storage.cache)
		fresh.stop()
		const old = await startPort('flame-text', { saved: { command: true }, reactExtras: true })
		check('/flame saved as on before is moved to off, once', old.storage.cache.command === false, old.storage.cache)
		old.stop()
	}

	// --- The optional flame button in the chat box: Discord's own chat box button, in the row of buttons
	/**
	 * A fake chat box. `Right` is `ChatInputRightActions` (a memo of a function that returns the row with its buttons as a
	 * list), `ActionButton` is `ChatInputActionButton`, and the finders answer for both by their file paths.
	 */
	const chatBox = (options = {}) => {
		const ActionButton = { $$typeof: 'memo', type: function Button() {} }
		let kept
		const make = props => ({ type: 'View', key: null, props: { style: { flexDirection: 'row' }, children: [props?.shouldShowGiftButton === false ? null : { type: 'GiftSlot', key: null, props: {} }, { type: 'EmojiButton', key: null, props: {} }] } })
		const rightType = function ChatInputRightActions(props) {
			if (props?.keep) return (kept ??= make(props))
			return make(props)
		}
		rightType.displayName = 'ChatInputRightActions'
		const Right = { $typeof: 'memo', type: rightType }
		const FireIcon = function FireIcon(props) { return { type: 'FireDrawn', key: null, props } }
		const flags = { buttonLoaded: options.buttonLoaded ?? true, finderBroken: false, fire: options.fire ?? true }
		const modules = { 'modules/chat_input/native/action_buttons/ChatInputRightActions.tsx': { default: Right }, 'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx': { default: ActionButton } }
		const findInReactFiber = (node, match) => {
			if (flags.finderBroken) throw new Error('finder broke')
			if (!node || typeof node !== 'object') return undefined
			if (match(node)) return node
			for (const child of Array.isArray(node.props?.children) ? node.props.children : []) {
				const hit = findInReactFiber(child, match)
				if (hit) return hit
			}
			return undefined
		}
		return {
			ActionButton,
			Right,
			rightType,
			flags,
			install: runtime => {
				const v = runtime.valenced
				v.discord.utils = { modules: { finders: {
					getModuleWithImportedPath: (path, callback) => { if (path.endsWith('ChatInputRightActions.tsx')) callback(modules[path]); return () => {} },
					lookupModuleWithImportedPath: path => (path.endsWith('ChatInputActionButton.tsx') && flags.buttonLoaded ? [modules[path], 1] : []),
				} } }
				v.utils.react = { findInReactFiber }
				v.utils.discord = { lookupGeneratedIconComponent: name => (flags.fire && name === 'FireIcon' ? FireIcon : undefined) }
			},
		}
	}
	const withChatBox = async (options = {}, port = {}) => {
		const b = chatBox(options)
		const s = await startPort('flame-text', { saved: {}, reactExtras: true, before: runtime => b.install(runtime), ...port })
		return Object.assign(s, { b })
	}
	const drawRow = (s, props) => s.b.Right.type(props)
	/** Flips the settings switch, which is how the setting changes in the app. */
	const flip = async (s, value) => {
		const settings = await s.mountSettings()
		switchRow(settings, 'Flame button in the chat box').props.onValueChange(value)
		await settings.settle()
		await sleep(5)
	}
	/** Draws the row the way the app does and finds the chat box buttons made of Discord's button component. */
	const drawnButtons = async s => {
		const view = await s.mountRender(() => drawRow(s, {}))
		return { view, buttons: findNodes(view.tree, n => n.type === s.b.ActionButton) }
	}

	{
		const s = await withChatBox()
		check('by default Discord\'s buttons are not touched at all', s.b.Right.type === s.b.rightType)
		check('and the row is exactly what Discord drew', drawRow(s, {}).props.children.length === 2)
		await flip(s, true)
		check('when it is switched on the buttons are patched', s.b.Right.type !== s.b.rightType)
		const row = drawRow(s, {})
		const kids = row.props.children
		check('the row is still the one Discord drew, nothing is wrapped around it', row.type === 'View' && row.props.style.flexDirection === 'row' && kids.length === 3, kids.map(k => k && k.type))
		check('the flame button is in the list just before the emoji button', kids[0].type === 'GiftSlot' && kids[1].key === 'flame-text' && kids[2].type === 'EmojiButton')
		check('the emoji and gift buttons are untouched', Object.keys(kids[0].props).length === 0 && Object.keys(kids[2].props).length === 0)
		check('it is the same element every draw, so React keeps it', drawRow(s, {}).props.children[1] === kids[1])
		const keptA = drawRow(s, { keep: true })
		const keptB = drawRow(s, { keep: true })
		check('a tree Discord keeps and draws again never gets the button twice', keptA === keptB && keptB.props.children.filter(c => c && c.key === 'flame-text').length === 1 && keptB.props.children.length === 3, keptB.props.children.length)
		const hidden = drawRow(s, { shouldShowGiftButton: false })
		check('when the gift button is not drawn the flame button still comes before the emoji button', hidden.props.children.length === 3 && hidden.props.children[1].key === 'flame-text' && hidden.props.children[2].type === 'EmojiButton' && hidden.props.children[0] === null, hidden.props.children.map(k => k && k.type))

		// What is drawn: Discord's own button, with the props every chat box button has
		const { view, buttons } = await drawnButtons(s)
		check('what is drawn is one of Discord\'s own chat box buttons', buttons.length === 1, textOf(view.tree))
		const button = () => findNodes(view.tree, n => n.type === s.b.ActionButton)[0]
		const first = button().props
		check('with a label, an icon, what tapping does and an on/off state', first.accessibilityLabel === 'Flame text' && typeof first.IconComponent === 'function' && typeof first.onPress === 'function' && first.accessibilityState.checked === false, first)
		check('the button says it is off in every way: not checked, not active', first.accessibilityState.checked === false && first.active === false && first.activeIconStyle.tintColor === '#ff6a00', first)
		button().props.onPress()
		await view.settle()
		check('tapping the button switches flame text on', s.storage.cache.on === true)
		check('and the button\'s state follows at once (checked), with the same label', button().props.accessibilityState.checked === true && button().props.accessibilityLabel === 'Flame text', button().props)
		check('and it is active too, with the orange icon style Discord\'s button uses', button().props.active === true && button().props.activeIconStyle.tintColor === '#ff6a00')
		await sleep(250)
		button().props.onPress()
		await view.settle()
		check('tapping again turns it off and unchecks it', s.storage.cache.on === false && button().props.accessibilityState.checked === false)
		const reportView = await s.mountSettings()
		findNode(reportView.tree, n => n.type === 'Design.Button' && n.props.text === 'Copy logs').props.onPress()
		check('the debug report says what is stored and what the button last drew', /Chat box button state: stored off; the button last drew off/.test(s.copied.at(-1)) && /\(0 doubled press\(es\) ignored\)/.test(s.copied.at(-1)), s.copied.at(-1)?.slice(-500))
		/** The icon the button was given, drawn with the chat box's own grey tint. */
		const icon = async () => {
			const iconView = await s.mountRender(() => s.runtime.React.createElement(first.IconComponent, { size: 'custom', style: [{ tintColor: '#999999' }] }))
			return findNode(iconView.tree, n => n.type === 'FireDrawn')
		}
		check('the icon is Discord\'s fire icon with the chat box\'s own grey tint while flame text is off', JSON.stringify((await icon()).props.style) === JSON.stringify([{ tintColor: '#999999' }]))
		await sleep(250)
		first.onPress()
		check('and the fire turns orange when it is on', JSON.stringify((await icon()).props.style) === JSON.stringify([[{ tintColor: '#999999' }], { tintColor: '#ff6a00' }]), (await icon())?.props.style)
		await sleep(250)
		first.onPress()
		check('and grey again when it is switched off', s.storage.cache.on === false && JSON.stringify((await icon()).props.style) === JSON.stringify([{ tintColor: '#999999' }]))

		// Switched off
		await flip(s, false)
		check('switching the setting off takes the patch off again', s.b.Right.type === s.b.rightType)
		check('and Discord\'s row is back to what it drew', drawRow(s, {}).props.children.length === 2)
		const slotView = await s.mountRender(() => kids[1])
		check('a button still on screen draws nothing until the chat box redraws', findNodes(slotView.tree, n => n.type === s.b.ActionButton).length === 0)
		await flip(s, true)
		check('switching it on again patches again, once', s.b.Right.type !== s.b.rightType && drawRow(s, {}).props.children.filter(c => c && c.key === 'flame-text').length === 1)
		s.stop()
		check('stopping the plugin takes the patch off', s.b.Right.type === s.b.rightType)
		check('no errors', s.errors.length === 0, s.errors)
	}

	// --- It works with Better Chat Buttons and with Chat Buttons (the plugin that puts the buttons in one menu)
	{
		const s = await withChatBox({}, { saved: { chatButton: true } })
		const { patcher } = s.runtime.valenced
		// Better Chat Buttons: hides the gift button through the props before the row draws, and reads the row after it.
		const seen = []
		patcher.before(s.b.Right, 'type', args => { args[0].shouldShowGiftButton = false; return args })
		patcher.after(s.b.Right, 'type', tree => { seen.push(tree.props.children.length); return tree })
		// Chat Buttons: patches the button component and lists what it finds (label, icon, on/off, what tapping does).
		const listed = new Map()
		const mergeAfter = tree => tree
		patcher.after(s.b.Right, 'type', mergeAfter)
		let threw = null
		let tree
		try {
			tree = s.b.Right.type({ shouldShowGiftButton: true })
		} catch (error) {
			threw = error
		}
		check('with Better Chat Buttons style patches on the same row nothing throws', threw === null, String(threw))
		check('the gift button is still hidden by the other plugin and the flame button is there', tree.props.children[0] === null && tree.props.children[1]?.key === 'flame-text' && tree.props.children[2]?.type === 'EmojiButton')
		check('a plugin that reads the row after it sees the flame button in the list', seen.length > 0 && seen.at(-1) === 3, seen)
		// Chat Buttons reads every Discord button when it is drawn: id from the label, the icon, the on/off state and what tapping does.
		const view = await s.mountRender(() => s.b.Right.type({ shouldShowGiftButton: true }))
		const read = () => findNodes(view.tree, n => n.type === s.b.ActionButton).map(node => ({ id: node.props.accessibilityLabel ?? node.props.IconComponent?.name, label: node.props.accessibilityLabel, Icon: node.props.IconComponent, on: node.props.accessibilityState?.checked ?? node.props.accessibilityState?.selected ?? node.props.active, press: node.props.onPress }))
		for (const entry of read()) listed.set(entry.id, entry)
		check('Chat Buttons would list it as "Flame text" with an icon, a switch state and an action', listed.size === 1 && listed.get('Flame text').label === 'Flame text' && typeof listed.get('Flame text').Icon === 'function' && listed.get('Flame text').on === false && typeof listed.get('Flame text').press === 'function', [...listed.values()])
		listed.get('Flame text').press()
		await view.settle()
		check('pressing it from that menu switches flame text', s.storage.cache.on === true)
		check('and what the menu reads next is switched on, under the same name, so the menu\'s switch follows', read().length === 1 && read()[0].id === 'Flame text' && read()[0].on === true, read())
		check('the name does not change with the state (so the menu keeps one row and its nickname)', new Set([read()[0].id]).size === 1)
		s.stop()
		check('stopping leaves the other plugins\' patches working', (() => { try { const t = s.b.Right.type({ shouldShowGiftButton: true }); return t.props.children.length === 2 && t.props.children[0] === null } catch { return false } })())
		check('no errors', s.errors.length === 0, s.errors)
	}

	// --- The button is definite: a press that is reported twice counts once, and the state is what is stored
	{
		const s = await withChatBox({}, { saved: { chatButton: true } })
		const view = await s.mountRender(() => drawRow(s, {}))
		const button = () => findNodes(view.tree, n => n.type === s.b.ActionButton)[0]
		const press = button().props.onPress
		press()
		press()
		press()
		await view.settle()
		check('a press reported three times at once switches flame text once', s.storage.cache.on === true && button().props.accessibilityState.checked === true && button().props.active === true, s.storage.cache.on)
		await sleep(250)
		press()
		await view.settle()
		check('a press after a moment is a new press', s.storage.cache.on === false && button().props.accessibilityState.checked === false && button().props.active === false)
		await sleep(250)
		press()
		await sleep(250)
		press()
		await sleep(250)
		press()
		await view.settle()
		check('every tap with a moment between switches it, so on after three more', s.storage.cache.on === true && button().props.accessibilityState.checked === true)
		const reportView = await s.mountSettings()
		findNode(reportView.tree, n => n.type === 'Design.Button' && n.props.text === 'Copy logs').props.onPress()
		check('the report counts the doubled presses it ignored', /\(2 doubled press\(es\) ignored\)/.test(s.copied.at(-1)), s.copied.at(-1)?.slice(-500))
		s.stop()
	}

	// --- The row is wrapped, not patched with Valenced's patcher, so hooks other plugins add are not shared with it
	{
		const calls = []
		const s_box = chatBox()
		const s = await startPort('flame-text', {
			saved: { chatButton: true },
			reactExtras: true,
			before: runtime => {
				s_box.install(runtime)
				const { patcher } = runtime.valenced
				for (const kind of ['before', 'after', 'instead']) {
					const original = patcher[kind]
					patcher[kind] = (parent, key, ...rest) => {
						calls.push(`${kind} ${String(key)}`)
						return original(parent, key, ...rest)
					}
				}
			},
		})
		s.b = s_box
		check('the row has the flame button all the same', drawRow(s, {}).props.children.filter(c => c && c.key === 'flame-text').length === 1)
		check('and it is Flame Text\'s own function, not a patcher proxy', s.b.Right.type !== s.b.rightType)

		// Another plugin patches over it afterwards: its hooks go into its own patch, and Flame Text's wrapper is only what it wraps.
		const { patcher } = s.runtime.valenced
		const undoOther = patcher.before(s.b.Right, 'type', args => args)
		const wrappedByOther = s.b.Right.type
		check('a plugin that patches the row later patches over Flame Text\'s function', wrappedByOther !== s.b.rightType && drawRow(s, {}).props.children.filter(c => c && c.key === 'flame-text').length === 1)

		// Switched off while the other plugin is over it: the wrapper stays in place, does nothing, and nothing else is disturbed.
		await flip(s, false)
		check('switched off while another plugin is over it, the row has no flame button and the other plugin\'s patch is untouched', s.b.Right.type === wrappedByOther && drawRow(s, {}).props.children.length === 2)
		await flip(s, true)
		check('switched on again there is exactly one flame button (the old wrapper does nothing, the new one adds it)', drawRow(s, {}).props.children.filter(c => c && c.key === 'flame-text').length === 1 && drawRow(s, {}).props.children.length === 3)
		await flip(s, false)
		check('and off again leaves none', drawRow(s, {}).props.children.length === 2)
		undoOther()
		s.stop()
		check('stopping with others around leaves the row working', (() => { try { return drawRow(s, {}).props.children.length === 2 } catch { return false } })())
		check('no errors', s.errors.length === 0, s.errors)
	}

	// --- The button waits for Discord's button component, and a broken lookup does not break the chat box
	{
		const s = await withChatBox({ buttonLoaded: false, fire: false }, { saved: { chatButton: true } })
		const first = await s.mountRender(() => drawRow(s, {}))
		check('before Discord has loaded its button component the row draws without the flame button and nothing throws', findNodes(first.tree, n => n.type === s.b.ActionButton).length === 0 && findNodes(first.tree, n => n.type === 'EmojiButton').length === 1)
		s.b.flags.buttonLoaded = true
		const second = await s.mountRender(() => drawRow(s, {}))
		check('once it has loaded the next draw has the flame button', findNodes(second.tree, n => n.type === s.b.ActionButton).length === 1)
		s.b.flags.finderBroken = true
		let threw = null
		let third
		try {
			third = drawRow(s, {})
		} catch (error) {
			threw = error
		}
		check('a lookup that throws leaves the chat box row alone and does not throw', threw === null && third.props.children.length === 2, String(threw))
		s.b.flags.finderBroken = false
		const icon = findNodes(second.tree, n => n.type === s.b.ActionButton)[0].props.IconComponent
		const iconView = await s.mountRender(() => s.runtime.React.createElement(icon, { size: 'custom', style: [{ tintColor: '#999999' }] }))
		check('with no fire icon in Discord the flame emoji stands in, dimmed while off', /\u{1F525}/u.test(textOf(iconView.tree)) && findNode(iconView.tree, n => n.type === 'Text')?.props.style.opacity < 1, textOf(iconView.tree))
		s.stop()
	}
	{
		const s = await start()
		const view = await s.mountSettings()
		switchRow(view, 'Flame button in the chat box').props.onValueChange(true)
		await view.settle()
		check('the settings switch adds the button', s.storage.cache.chatButton === true)
		s.stop()
	}

	// --- The settings screen
	{
		const s = await start({ previewText: 'Spark' })
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		check('it opens with a short intro', /burning, animated GIF/.test(text))
		check('it shows the main switch and says it is off', !!switchRow(view, 'Turn my messages into flame GIFs') && /Off/.test(text))
		check('it has the preview box with the saved words', findNodes(view.tree, n => n.type === 'Design.TextInput').some(n => n.props.value === 'Spark'))
		await sleep(1200)
		await view.settle()
		const picture = findNode(view.tree, n => n.type === 'Image' && /^data:image\/gif;base64,/.test(n.props.source?.uri ?? ''))
		check('the preview shows the GIF drawn for those words', !!picture, textOf(view.tree))
		const shown = readGif(bytesOf(picture.props.source.uri.split(',')[1]))
		check('and it is a real animated GIF', shown.ended && shown.frames.length === 8)
		check('it says how big it is', /\d+ × \d+, 8 pictures/.test(textOf(view.tree)), textOf(view.tree))
		const first = picture.props.source.uri
		button(view, 'Shuffle the flames').props.onPress()
		await view.settle()
		await sleep(1200)
		await view.settle()
		const again = findNode(view.tree, n => n.type === 'Image' && /^data:image\/gif/.test(n.props.source?.uri ?? ''))
		check('shuffling gives the same words other flames', !!again && again.props.source.uri !== first)
		const chip = label => findNode(view.tree, n => n.type === 'Pressable' && n.props.accessibilityLabel === label)
		chip('Blue').props.onPress()
		await view.settle()
		check('the look is picked with chips and saved', s.storage.cache.style === 'blue' && chip('Blue').props.accessibilityState.selected === true)
		await sleep(1200)
		await view.settle()
		const blue = findNode(view.tree, n => n.type === 'Image' && /^data:image\/gif/.test(n.props.source?.uri ?? ''))
		check('and the preview is drawn again in the new look', !!blue && blue.props.source.uri !== again.props.source.uri)
		for (const [label, key, value] of [['Large', 'size', 'large'], ['High', 'height', 'high'], ['White', 'background', 'white'], ['Smooth', 'motion', 'smooth'], ['Classic', 'look', 'classic']]) {
			chip(label).props.onPress()
			await view.settle()
			check(`the ${label} chip sets ${key}`, s.storage.cache[key] === value, s.storage.cache)
		}
		switchRow(view, 'Turn my messages into flame GIFs').props.onValueChange(true)
		await view.settle()
		check('the main switch turns it on', s.storage.cache.on === true && /On/.test(textOf(view.tree)))
		switchRow(view, 'Add the words as text').props.onValueChange(true)
		switchRow(view, 'Glow around the flames').props.onValueChange(false)
		await view.settle()
		check('the other switches save', s.storage.cache.caption === true && s.storage.cache.glow === false)
		check('the screen has no credits', !hasCredits(textOf(view.tree)))
		check('it ends with the debugging section', textOf(view.tree).includes('DEBUGGING') && !!button(view, 'Copy logs') && !!button(view, 'Run self-check'))
		s.stop()
	}
	{
		const s = await start({ previewText: 'No 😀' })
		const view = await s.mountSettings()
		await sleep(1200)
		await view.settle()
		check('words with an emoji say they cannot be drawn in the preview', /no letter for something in this text/.test(textOf(view.tree)) && !findNode(view.tree, n => n.type === 'Image'))
		s.stop()
	}

	// --- The report
	{
		const s = await start({ on: true }, { })
		await say(s, 'private words here')
		const cmd = flameOf(s.builtIns.getBuiltInCommands([1], true, false))
		cmd.execute([], { channel: { id: 'chan-private-123' } })
		const view = await s.mountSettings()
		button(view, 'Copy logs').props.onPress()
		const report = s.copied.at(-1) ?? ''
		check('the report starts with the plugin and Discord versions', /Flame Text debug report/.test(report) && /Discord: 354\.5/.test(report), report.slice(0, 300))
		check('it says the message module was found and patched', /Message module \(sendMessage\): found; patch patched/.test(report))
		check('it says whether Discord’s file and upload code were found', /file code \(writeFile\): found; upload object \(CloudUpload\): found; upload platform number: 0/.test(report), report)
		check('it counts messages, GIFs and problems', /Messages looked at while on: 1; sent as flame GIFs: 1/.test(report) && /Problems: 0; sent as plain text because the GIF failed: 0; the step the last GIF reached: done/.test(report), report)
		check('it says how big the last GIF was and how long it took', /Last GIF: \d+x\d+, 8 pictures, \d+ KB, made in \d+ ms/.test(report), report)
		check('it says what the command and the chat box did', /Command: module found; patch patched/.test(report) && /\/flame was in the answer [1-9]/.test(report) && /[+] menu: watched yes/.test(report) && /run 1 time\(s\)/.test(report), report)
		check('it has the settings', /"on":/.test(report) && /"style": "fire"/.test(report))
		check('it holds no message text or chat', !/private words here|chan-private-123|chan1/.test(report), report)
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const checks = findNodes(view.tree, n => n.type === 'Design.TableRow' && /^[✓✗]/.test(n.props.label ?? '')).map(n => n.props.label)
		check('the self-check lists its steps', checks.length >= 8 && checks.some(c => /flame GIF can be drawn/.test(c)) && checks.some(c => /file code/.test(c)) && checks.some(c => /upload object/.test(c)), checks)
		const drawn = findNode(view.tree, n => n.type === 'Design.TableRow' && /flame GIF can be drawn/.test(n.props.label ?? ''))
		check('the drawing test passes and says how long it took', /^✓/.test(drawn.props.label) && /1 picture, \d+ KB, \d+ ms/.test(drawn.props.subLabel ?? ''), drawn.props)
		s.stop()
	}
	{
		// Nothing found: the screen and the report say what is missing
		const s = await startPort('flame-text', { reactExtras: true })
		const view = await s.mountSettings()
		button(view, 'Copy logs').props.onPress()
		const report = s.copied.at(-1) ?? ''
		check('when nothing is found the report says so', /Message module \(sendMessage\): not found yet/.test(report) && /file code \(writeFile\): not found yet/.test(report))
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	{
		// The newer defaults and the classic look
		const fresh = await startPort('flame-text', { saved: {}, reactExtras: true })
		fresh.stop()
		const probe = await start({ on: true, defaultsSeen: false, size: 'large', background: 'dark', motion: 'off' })
		await say(probe, 'Hi')
		const moved = gifOf(probe)
		check('settings saved before the new defaults are moved to small and see-through, once', moved.width < 200 && moved.transparent !== undefined && moved.transparent >= 0, [moved.width, moved.transparent])
		probe.stop()
		const wild = await start({ on: true, motion: 'off', background: 'transparent', size: 'small', look: 'wild' })
		await say(wild, 'Look')
		const wildGif = gifOf(wild)
		wild.stop()
		const classic = await start({ on: true, motion: 'off', background: 'transparent', size: 'small', look: 'classic' })
		await say(classic, 'Look')
		const classicGif = gifOf(classic)
		check('the classic look is a different, shorter picture than the wild one', classicGif.height < wildGif.height && differ(classicGif.frames[0], wildGif.frames[0].slice(0, classicGif.frames[0].length)), [classicGif.height, wildGif.height])
		check('the classic look is see-through around the letters', classicGif.frames[0].some(v => v === classicGif.transparent) && classicGif.frames[0].some(v => v !== classicGif.transparent))
		const view = await classic.mountSettings()
		const styleChip = findNodes(view.tree, n => n.props?.accessibilityLabel === 'Classic' || textOf(n) === 'Classic')
		check('the settings offer the Classic style', styleChip.length > 0)
		classic.stop()
	}

	// --- One chat never gets flame text (built in, not a setting)
	{
		const BLOCKED = '1567899938896220160'
		const s = await start({ on: true }, { stores: { ChannelStore: { getChannel: id => (id === 'thread-in-it' ? { id, parent_id: BLOCKED } : id === 'thread-elsewhere' ? { id, parent_id: 'other-channel' } : { id }) } } })
		const sendTo = async (channelId, content, options = {}) => {
			const before = s.messages.sent.length
			await s.messages.sendMessage(channelId, { content, nonce: 'n' }, false, options)
			await sleep(5)
			return s.messages.sent.slice(before)
		}

		const blocked = await sendTo(BLOCKED, 'burn me')
		check('with the switch on, a message to that chat goes out as the words, not a GIF', blocked.length === 1 && blocked[0].message.content === 'burn me' && !blocked[0].options.attachmentsToUpload && blocked[0].channelId === BLOCKED, blocked)
		check('nothing was drawn or saved for it', s.files.written.length === 0 && s.uploads.made.length === 0)
		check('and nobody is told anything', s.toasts().length === 0, s.toasts())
		check('the message is passed on exactly as it was', blocked[0].message.nonce === 'n')

		const viaThread = await sendTo('thread-in-it', 'in a post')
		check('a thread or forum post inside that channel is plain text too', viaThread.length === 1 && viaThread[0].message.content === 'in a post' && !viaThread[0].options.attachmentsToUpload, viaThread)
		const elsewhere = await sendTo('thread-elsewhere', 'burn me too')
		check('a thread somewhere else is still burned', elsewhere.length === 1 && elsewhere[0].options.attachmentsToUpload?.length === 1 && elsewhere[0].message.content === '', elsewhere)
		const other = await sendTo('chan1', 'burn me three')
		check('every other chat is still burned', other.length === 1 && other[0].options.attachmentsToUpload?.length === 1, other)

		// /flame text in that chat is sent as the words, silently.
		const cmd = flameOf(s.builtIns.getBuiltInCommands([1], true, false))
		const writtenBefore = s.files.written.length
		const sentBefore = s.messages.sent.length
		cmd.execute([{ name: 'text', value: 'one shot' }], { channel: { id: BLOCKED } })
		await sleep(30)
		const via = s.messages.sent.slice(sentBefore)
		check('/flame text in that chat sends the words as a normal message', via.length === 1 && via[0].channelId === BLOCKED && via[0].message.content === 'one shot' && !via[0].options.attachmentsToUpload, via)
		check('with no GIF drawn and no message about it', s.files.written.length === writtenBefore && s.toasts().length === 0, s.toasts())
		cmd.execute([{ name: 'text', value: 'see https://example.com' }], { channel: { id: BLOCKED } })
		await sleep(30)
		check('even text that Flame Text would refuse is just sent there', s.messages.sent.slice(sentBefore).length === 2 && s.toasts().length === 0)
		cmd.execute([{ name: 'text', value: 'one shot' }], { channel: { id: 'chan7' } })
		await until(() => s.messages.sent.length >= sentBefore + 3)
		check('/flame text in another chat still makes a GIF', s.messages.sent.at(-1).channelId === 'chan7' && s.messages.sent.at(-1).options.attachmentsToUpload?.length === 1)
		s.stop()
	}


	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
