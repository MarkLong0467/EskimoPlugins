// Mock tests for Crop Plus. Run with: node tests/crop-plus.test.cjs
// (build first: bun run build:dev, or just run `bun run test`). BUNDLE_DIR runs them against another build.
const { readBundleSource } = require('./lib/harness.cjs')
let failed = 0
const check = (name, ok, extra) => {
	console.log(`${ok ? 'ok   ' : 'FAIL '}${name}${ok || extra === undefined ? '' : `  -> ${extra}`}`)
	if (!ok) failed += 1
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const contexts = new Map()
let currentContext = null
const React = {
	useState: (initial) => { const ctx = currentContext; const i = ctx.cursor++; if (!(i in ctx.states)) ctx.states[i] = typeof initial === 'function' ? initial() : initial; return [ctx.states[i], (v) => { ctx.states[i] = typeof v === 'function' ? v(ctx.states[i]) : v }] },
	useEffect: (fn) => { const ctx = currentContext; ctx.effects.push(fn) },
	cloneElement: (element, props) => ({ ...element, props: { ...element.props, ...props } }),
	Component: class {},
}
function expandAt(node, pathKey) {
	if (Array.isArray(node)) return node.map((n, i) => expandAt(n, `${pathKey}/${(n && n.key) || i}`))
	if (!node || typeof node !== 'object') return node
	if (typeof node.type === 'function') {
		pathKey = `${pathKey}>${node.type.name}${node.key ? `#${node.key}` : ''}`
		let ctx = contexts.get(pathKey)
		if (!ctx) { ctx = { states: {}, cursor: 0, effects: [] }; contexts.set(pathKey, ctx) }
		ctx.cursor = 0
		const previous = currentContext
		currentContext = ctx
		const out = node.type(node.props)
		currentContext = previous
		return expandAt(out, pathKey)
	}
	return { ...node, props: { ...node.props, children: expandAt(node.props && node.props.children, `${pathKey}.${typeof node.type === 'string' ? node.type : 'x'}`) } }
}
const findAll = (tree, test, out = []) => { if (Array.isArray(tree)) tree.forEach((n) => findAll(n, test, out)); else if (tree && typeof tree === 'object') { if (test(tree)) out.push(tree); findAll(tree.props && tree.props.children, test, out) } return out }
const texts = (node, out = []) => {
	if (Array.isArray(node)) node.forEach((n) => texts(n, out))
	else if (typeof node === 'string') out.push(node)
	else if (node && typeof node === 'object') { const p = node.props || {}; ;['label', 'subLabel', 'text', 'title'].forEach((k) => { if (typeof p[k] === 'string') out.push(p[k]) }); texts(p.children, out) }
	return out
}
const has = (tree, text) => texts(tree).some((t) => t.includes(text))
const press = (tree, label) => { const hit = findAll(tree, (n) => n.props && (n.props.label === label || n.props.text === label) && typeof n.props.onPress === 'function')[0]; if (!hit) throw new Error(`no pressable "${label}"`); hit.props.onPress() }
const tap = (tree, text) => { const hit = findAll(tree, (n) => n.type === 'Pressable' && texts(n).includes(text))[0]; if (!hit) throw new Error(`no chip "${text}"`); hit.props.onPress() }

const result = (n, over = {}) => ({ path: `file:///cache/crop${n}.jpg`, width: 1000 / n, height: 800 / n, mime: 'image/jpeg', size: 90000 / n, cropRect: { x: 1, y: 1, width: 1000 / n, height: 800 / n }, ...over })
const discordOptions = (over = {}) => ({ mediaType: 'photo', path: 'file:///photos/a.jpg', width: 4000, height: 3000, freeStyleCropEnabled: true, cropperToolbarTitle: 'Crop', cropperChooseColor: '#fff', ...over })

function load(settings = {}, options = {}) {
	contexts.clear()
	const state = { calls: [], cleaned: [], sheets: [], toasts: [], hidden: 0, queue: options.results || [result(1), result(2), result(3), result(4)] }
	const picker = {
		openPicker: () => Promise.resolve([]),
		openCropper: (o) => {
			state.calls.push(o)
			const next = state.queue.shift()
			if (next === 'cancel') return Promise.reject(Object.assign(new Error('cancelled'), { code: 'E_PICKER_CANCELLED' }))
			if (next instanceof Error) return Promise.reject(next)
			return Promise.resolve(next)
		},
		cleanSingle: (p) => { state.cleaned.push(p); return Promise.resolve() },
	}
	const runtime = { jsx: (type, props, key) => ({ type, props: props || {}, key }), jsxs: (type, props, key) => ({ type, props: props || {}, key }) }
	state.subs = []
	global.valenced = {
		react: { React, ReactNative: { View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', Image: 'Image' }, ReactJSXRuntime: runtime },
		externals: { ReactNativeClipboard: { Clipboard: { setString: (t) => { global.copied = t } } } },
		discord: {
			actions: { ToastActionCreators: { open: (k, o) => state.toasts.push(o.text) }, ActionSheetActionCreators: { openLazy: (p, key) => { state.sheets.push({ p, key }); return p }, hideActionSheet: () => { state.hidden += 1 } } },
			design: { Design: new Proxy({}, { get: (_, key) => key }) },
		},
		patcher: {
			instead: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { return fn.call(this, a, original) }; return () => { object[key] = original } },
			after: () => () => {},
		},
		modules: { finders: { filters: { withProps: (...n) => n.join() },
			getModules: (f, cb) => { const sub = { f, cb }; state.subs.push(sub); return () => {} },
			lookupModule: (f) => (f === 'openCropper,openPicker' && !options.late ? [options.onDefault ? { default: picker } : picker] : []) } },
	}
	global.plugin = (d) => d
	const data = { cache: { ...settings } }
	const json = { get cache() { return data.cache }, use() { return data.cache }, set(patch) { Object.assign(data.cache, patch) } }
	const { source } = readBundleSource('crop-plus')
	const plugin = new Function('valenced', 'plugin', `return ${source}`)(global.valenced, global.plugin).default
	plugin.start({ cleanup: (fn) => fn, jsonStorage: json })
	const screen = () => expandAt({ type: plugin.SettingsComponent, props: { api: { jsonStorage: json } } }, 'root')
	/** The sheet that is open now, drawn. */
	const sheetTree = async () => { const last = state.sheets[state.sheets.length - 1]; const mod = await last.p; return expandAt({ type: mod.default, props: {} }, `sheet${state.sheets.length}`) }
	return { plugin, data, json, state, picker, screen, sheetTree }
}
/** Waits until the sheet has been opened `n` times. */
const sheets = async (app, n) => { for (let i = 0; i < 100 && app.state.sheets.length < n; i += 1) await sleep(10); return app.state.sheets.length >= n }

;(async () => {
	// 1. Plain crop, no sheet
	{
		const app = load({ again: false })
		const given = discordOptions()
		const got = await app.picker.openCropper(given)
		check('with "offer again" off the first crop is returned as it is', got.path === 'file:///cache/crop1.jpg' && app.state.sheets.length === 0)
		check('the object Discord passed is not changed', given.showCropGuidelines === undefined && given.compressImageQuality === undefined)
		const sent = app.state.calls[0]
		check('the cropper still gets Discord’s own options (path, colours, texts)', sent.path === given.path && sent.cropperToolbarTitle === 'Crop' && sent.cropperChooseColor === '#fff' && sent.mediaType === 'photo')
		check('...with free-style resizing and the settings’ grid, frame, rotation and bottom controls', sent.freeStyleCropEnabled === true && sent.showCropGuidelines === false && sent.showCropFrame === true && sent.enableRotationGesture === false && sent.hideBottomControls === false)
		check('...and Discord’s width and height (the picture’s shape) by default', sent.width === 4000 && sent.height === 3000)
	}

	// 2. Crop again
	{
		const app = load()
		const promise = app.picker.openCropper(discordOptions())
		check('the sheet opens after the first crop', await sheets(app, 1) && app.state.sheets[0].key === 'MARKLONG_CROP_PLUS_ASK')
		let tree = await app.sheetTree()
		check('the sheet shows the size of the crop and asks to crop smaller', has(tree, 'Crop smaller?') && has(tree, '1000 × 800') && has(tree, '88 KB'))
		check('...and a preview of the picture', findAll(tree, (n) => n.type === 'Image' && n.props.source && n.props.source.uri === 'file:///cache/crop1.jpg').length === 1)
		check('...but no "go back" button yet', !has(tree, 'Go back to'))
		press(tree, 'Crop smaller')
		check('"Crop smaller" opens the cropper again on the new picture', await (async () => { for (let i = 0; i < 100 && app.state.calls.length < 2; i += 1) await sleep(10); return app.state.calls.length === 2 })())
		const second = app.state.calls[1]
		check('...with that picture as the path and its own shape', second.path === 'file:///cache/crop1.jpg' && second.width === 1000 && second.height === 800, JSON.stringify({ p: second.path, w: second.width, h: second.height }))
		check('...and Discord’s colours kept (only the title says which crop it is)', second.cropperChooseColor === '#fff' && second.cropperToolbarTitle === 'Crop 2 · 1000 × 800')
		check('a sheet opens again for the second crop', await sheets(app, 2))
		tree = await app.sheetTree()
		check('...showing the new size and a "go back" button', has(tree, '500 × 400') && has(tree, 'Go back to 1000 × 800'))
		press(tree, 'Use this one')
		const final = await promise
		check('"Use this one" returns the last crop to Discord', final.path === 'file:///cache/crop2.jpg' && final.width === 500)
		check('the picture of the first pass is deleted, the last one is kept', app.state.cleaned.includes('file:///cache/crop1.jpg') && !app.state.cleaned.includes('file:///cache/crop2.jpg'))
	}

	// 3. Go back
	{
		const app = load()
		const promise = app.picker.openCropper(discordOptions())
		await sheets(app, 1); press(await app.sheetTree(), 'Crop smaller')
		await sheets(app, 2); press(await app.sheetTree(), 'Go back to 1000 × 800')
		check('"go back" drops the last crop and asks again about the one before', await sheets(app, 3))
		const tree = await app.sheetTree()
		check('...showing the earlier size', has(tree, '1000 × 800') && !has(tree, 'Go back to'))
		check('...and the dropped picture is deleted', app.state.cleaned.includes('file:///cache/crop2.jpg'))
		press(tree, 'Use this one')
		const final = await promise
		check('using it returns the earlier crop', final.path === 'file:///cache/crop1.jpg' && app.state.calls.length === 2)
	}

	// 4. Cancelling
	{
		const first = load({}, { results: ['cancel'] })
		let error
		try { await first.picker.openCropper(discordOptions()) } catch (e) { error = e }
		check('cancelling the first crop is a normal cancel for Discord', error && error.code === 'E_PICKER_CANCELLED' && first.state.sheets.length === 0)
		const later = load({}, { results: [result(1), 'cancel'] })
		const promise = later.picker.openCropper(discordOptions())
		await sheets(later, 1); press(await later.sheetTree(), 'Crop smaller')
		const kept = await promise
		check('cancelling a later crop keeps the one before', kept.path === 'file:///cache/crop1.jpg')
		const sheet = load()
		const p = sheet.picker.openCropper(discordOptions())
		await sheets(sheet, 1)
		let error2
		const pending = p.catch((e) => { error2 = e })
		press(await sheet.sheetTree(), 'Cancel (keep the original)')
		await pending
		check('"Cancel" on the sheet cancels the whole crop and deletes the picture made', error2 && error2.code === 'E_PICKER_CANCELLED' && sheet.state.cleaned.includes('file:///cache/crop1.jpg'))
		const broken = load({}, { results: [new Error('native crash')] })
		let error3
		try { await broken.picker.openCropper(discordOptions()) } catch (e) { error3 = e }
		check('another error from the cropper is passed on', error3 && error3.message === 'native crash')
	}

	// 5. When the sheet is shown
	{
		const small = load({ askAbove: 1024 })
		const got = await small.picker.openCropper(discordOptions())
		check('"only ask when bigger than" skips the sheet for a small result', got.width === 1000 && small.state.sheets.length === 0)
		const big = load({ askAbove: 512 })
		const p = big.picker.openCropper(discordOptions())
		check('...and asks for a bigger one', await sheets(big, 1))
		press(await big.sheetTree(), 'Use this one'); await p
		const limit = load({ maxPasses: 2, askAbove: 0 })
		const lp = limit.picker.openCropper(discordOptions())
		await sheets(limit, 1); press(await limit.sheetTree(), 'Crop smaller')
		const final = await lp
		check('the limit on crops in a row stops it without a second sheet', limit.state.sheets.length === 1 && final.path === 'file:///cache/crop2.jpg' && limit.state.calls.length === 2 && has(limit.screen(), 'Stopped after 2 crops'))
		const off = load({ enabled: false })
		const direct = await off.picker.openCropper(discordOptions())
		check('with the plugin off the cropper is left alone', direct.path === 'file:///cache/crop1.jpg' && off.state.calls[0].showCropGuidelines === undefined && off.state.sheets.length === 0)
		const avatar = load()
		const a = await avatar.picker.openCropper(discordOptions({ freeStyleCropEnabled: false, width: 512, height: 512 }))
		check('a crop that is not free-style (profile picture) is left alone by default', a.width === 1000 && avatar.state.sheets.length === 0 && avatar.state.calls[0].showCropGuidelines === undefined)
		const all = load({ scope: 'everywhere' })
		const ap = all.picker.openCropper(discordOptions({ freeStyleCropEnabled: false, width: 512, height: 512 }))
		check('"every crop" also works on it', await sheets(all, 1))
		press(await all.sheetTree(), 'Use this one'); await ap
		const dismissed = load()
		const dp = dismissed.picker.openCropper(discordOptions())
		await sheets(dismissed, 1)
		await dismissed.sheetTree()
		for (const ctx of contexts.values()) ctx.effects.forEach((fn) => { const cleanup = fn(); if (typeof cleanup === 'function') cleanup() })
		const closed = await dp
		check('a sheet that is closed without a choice counts as "use this one"', closed.path === 'file:///cache/crop1.jpg' && dismissed.state.calls.length === 1)
	}

	// 5b. Automatic mode
	{
		const app = load({ mode: 'auto', targetPx: 300, maxPasses: 6 }, { results: [result(1), result(2), result(3), result(4)] })
		const got = await app.picker.openCropper(discordOptions())
		check('in automatic mode the cropper opens again at once, with no sheet', app.state.sheets.length === 0 && app.state.calls.length >= 3)
		check('...until the longest side is at most the target (1000, 500, 333, 250)', got.path === 'file:///cache/crop4.jpg' && app.state.calls.length === 4, `${app.state.calls.length} calls, ${got.path}`)
		check('...each pass crops the picture the one before made', app.state.calls[1].path === 'file:///cache/crop1.jpg' && app.state.calls[3].path === 'file:///cache/crop3.jpg')
		check('...and says what to do', app.state.toasts.some((x) => /Pick a smaller part, or Cancel/.test(x)))
		const stop = load({ mode: 'auto', targetPx: 64 }, { results: [result(1), result(2), 'cancel'] })
		const kept = await stop.picker.openCropper(discordOptions())
		check('cancelling a pass in automatic mode keeps the last result', kept.path === 'file:///cache/crop2.jpg')
		const limit = load({ mode: 'auto', targetPx: 64, maxPasses: 2 }, { results: [result(1), result(2), result(3)] })
		const lim = await limit.picker.openCropper(discordOptions())
		check('the limit on crops in a row stops automatic mode', lim.path === 'file:///cache/crop2.jpg' && limit.state.calls.length === 2)
		const small = load({ mode: 'auto', targetPx: 2000 })
		const one = await small.picker.openCropper(discordOptions())
		check('a first crop that is already small enough is returned at once', one.path === 'file:///cache/crop1.jpg' && small.state.calls.length === 1)
		const nothing = load({ mode: 'auto', again: false })
		await nothing.picker.openCropper(discordOptions())
		check('with "crop again" off, automatic mode does nothing', nothing.state.calls.length === 1)
		const screen = load({ mode: 'auto' }).screen()
		check('the screen shows the mode and the target only when they matter', has(screen, 'Keep going until it is small') && has(screen, 'Stop when the longest side is at most'))
		const ask = load({ mode: 'ask' }).screen()
		check('...and no target in "ask" mode', !has(ask, 'Stop when the longest side is at most') && has(ask, 'The frame cannot get smaller'))
		const radio = load()
		findAll(radio.screen(), (n) => n.props && n.props.title === 'How it goes on')[0].props.onChange('auto')
		check('the mode is saved', radio.data.cache.mode === 'auto')
	}

	// 5c. The "smallest crop" preset
	{
		const app = load({ enabled: false, again: false, mode: 'ask', targetPx: 512, maxPasses: 2, ratio: '16:9', quality: 70, maxWidth: 512 })
		press(app.screen(), 'Set up for the smallest crop')
		const c = app.data.cache
		check('one tap sets everything for tiny crops', c.enabled === true && c.again === true && c.mode === 'auto' && c.targetPx === 32 && c.maxPasses === 15 && c.ratio === 'free' && c.quality === 100 && c.maxWidth === 0, JSON.stringify(c))
		check('...and says what to do next', app.state.toasts.some((x) => /Add a picture, tap Edit image/.test(x)))
		const results = [1, 2, 3, 4, 5, 6, 7].map((n) => result(n, { width: Math.round(1000 / Math.pow(3, n)), height: Math.round(800 / Math.pow(3, n)) }))
		const run = load(app.data.cache, { results })
		const got = await run.picker.openCropper(discordOptions())
		check('and a crop then goes on by itself until it is 32 px or less', got.width <= 32 && run.state.sheets.length === 0, `${got.width}px after ${run.state.calls.length}`)
		check('...with no starting shape', run.state.calls[0].width === undefined)
		const auto = load({ mode: 'auto' })
		check('the targets go down to 16 px and the limit up to 15 crops', findAll(auto.screen(), (n) => n.type === 'Pressable' && texts(n).includes('16px')).length === 1 && findAll(auto.screen(), (n) => n.type === 'Pressable' && texts(n).includes('15')).length === 1)
	}

	// 5d. Titles and the tip
	{
		const app = load({ mode: 'auto', targetPx: 100 }, { results: [result(1), result(2), result(3), result(4), result(1), result(2), result(3), result(4)] })
		await app.picker.openCropper(discordOptions())
		check('the first crop keeps Discord\u2019s own title', app.state.calls[0].cropperToolbarTitle === 'Crop')
		check('later crops say which crop it is and how big the picture is', app.state.calls[1].cropperToolbarTitle === 'Crop 2 · 1000 × 800' && app.state.calls[2].cropperToolbarTitle === 'Crop 3 · 500 × 400', app.state.calls.map((c) => c.cropperToolbarTitle).join(' | '))
		check('a tip is shown once, naming the check mark, the X and pinching', app.state.toasts.filter((x) => /pinch to zoom in first/.test(x)).length === 1 && app.state.toasts.some((x) => /tap the check mark/.test(x) && /Tap the X/.test(x)))
		await app.picker.openCropper(discordOptions())
		check('...and not again in the same run', app.state.toasts.filter((x) => /pinch to zoom in first/.test(x)).length === 1)
		const quiet = load({ tips: false, titles: false, mode: 'auto', targetPx: 2000, maxPasses: 3 })
		await quiet.picker.openCropper(discordOptions())
		check('both can be turned off', !quiet.state.toasts.some((x) => /pinch/.test(x)) && quiet.state.calls[0].cropperToolbarTitle === 'Crop')
		const ask = load({ mode: 'ask' })
		const p = ask.picker.openCropper(discordOptions())
		await sheets(ask, 1)
		check('in "ask" mode the tip speaks of the sheet', ask.state.toasts.some((x) => /A sheet then offers to crop smaller/.test(x)))
		press(await ask.sheetTree(), 'Use this one'); await p
	}

	// 6. Options
	{
		const shapes = { '1:1': [1000, 1000], '4:3': [4000, 3000], '16:9': [16000, 9000], '9:16': [9000, 16000] }
		for (const [ratio, [w, h2]] of Object.entries(shapes)) {
			const app = load({ ratio, again: false })
			await app.picker.openCropper(discordOptions())
			check(`starting shape ${ratio} sets width ${w} and height ${h2}`, app.state.calls[0].width === w && app.state.calls[0].height === h2, JSON.stringify([app.state.calls[0].width, app.state.calls[0].height]))
		}
		const free = load({ ratio: 'free', again: false })
		await free.picker.openCropper(discordOptions())
		check('"Free" removes the starting shape', free.state.calls[0].width === undefined && free.state.calls[0].height === undefined)
		const look = load({ guidelines: true, frame: false, rotation: true, bottomControls: false, freeStyle: false, again: false })
		await look.picker.openCropper(discordOptions({ freeStyleCropEnabled: true }))
		const o = look.state.calls[0]
		check('grid, frame, rotation and bottom controls follow the switches', o.showCropGuidelines === true && o.showCropFrame === false && o.enableRotationGesture === true && o.hideBottomControls === true)
		const shrink = load({ maxWidth: 512, maxHeight: 1024, quality: 80, again: false })
		await shrink.picker.openCropper(discordOptions())
		const s = shrink.state.calls[0]
		check('shrinking and quality go to the cropper as compress options', s.compressImageMaxWidth === 512 && s.compressImageMaxHeight === 1024 && s.compressImageQuality === 0.8)
		const plain = load({ again: false })
		await plain.picker.openCropper(discordOptions())
		check('without them the compress options are not sent', plain.state.calls[0].compressImageMaxWidth === undefined && plain.state.calls[0].compressImageQuality === undefined)
		const later = load({ ratio: 'discord' })
		const lp = later.picker.openCropper(discordOptions())
		await sheets(later, 1); press(await later.sheetTree(), 'Crop smaller')
		await sheets(later, 2); press(await later.sheetTree(), 'Use this one'); await lp
		check('a later pass uses the size of the picture it crops, not the original’s', later.state.calls[1].width === 1000 && later.state.calls[1].height === 800)
		const keep = load({ cleanTemp: false })
		const kp = keep.picker.openCropper(discordOptions())
		await sheets(keep, 1); press(await keep.sheetTree(), 'Crop smaller')
		await sheets(keep, 2); press(await keep.sheetTree(), 'Use this one'); await kp
		check('with "delete earlier pictures" off nothing is deleted', keep.state.cleaned.length === 0)
		const noUndo = load({ undoStack: false })
		const np = noUndo.picker.openCropper(discordOptions())
		await sheets(noUndo, 1); press(await noUndo.sheetTree(), 'Crop smaller')
		await sheets(noUndo, 2)
		const t = await noUndo.sheetTree()
		check('"go back" can be turned off', !has(t, 'Go back to'))
		press(t, 'Use this one'); await np
	}

	// 7. Finding the cropper
	{
		const onDefault = load({ again: false }, { onDefault: true })
		await onDefault.picker.openCropper(discordOptions())
		check('the cropper is also found on a default export', onDefault.state.calls[0].showCropFrame === true)
		const late = load({ again: false }, { late: true })
		check('a cropper that is not loaded yet is picked up when it loads', late.state.subs.some((x) => x.f === 'openCropper,openPicker'))
		late.state.subs[0].cb(late.picker)
		late.state.subs[0].cb(late.picker)
		await late.picker.openCropper(discordOptions())
		check('...and wrapped only once', late.state.calls.length === 1 && late.state.calls[0].showCropFrame === true)
		const old = load({ again: false })
		const newer = load({ again: false })
		await old.picker.openCropper(discordOptions())
		check('an older loaded copy of the plugin leaves the cropper alone', old.state.calls[0].showCropFrame === undefined)
	}

	// 8. Settings screen, self-check, report
	{
		const app = load()
		let tree = app.screen()
		check('the screen shows the state and how to use it', texts(tree).some((t) => /^Crop Plus \d+\.\d+\.\d+$/.test(t)) && has(tree, 'On') && has(tree, 'choose Edit image'))
		findAll(tree, (n) => n.props && n.props.title === 'Where it works')[0].props.onChange('everywhere')
		check('the scope is saved', app.data.cache.scope === 'everywhere')
		findAll(app.screen(), (n) => n.props && n.props.title === 'Starting shape of the frame')[0].props.onChange('1:1')
		check('the starting shape is saved', app.data.cache.ratio === '1:1')
		tap(app.screen(), '10')
		check('a number chip is saved (most crops in a row)', app.data.cache.maxPasses === 10)
		const widthChips = findAll(app.screen(), (n) => n.type === 'Pressable' && texts(n).includes('512px'))
		check('the sizes appear in more than one row (only ask above, widest, tallest)', widthChips.length === 3, widthChips.length)
		widthChips[1].props.onPress()
		check('a chip of the "widest" row is saved', app.data.cache.maxWidth === 512)
		tap(app.screen(), '70%')
		check('the quality chip is saved', app.data.cache.quality === 70)
		findAll(app.screen(), (n) => n.props && n.props.label === 'Grid lines')[0].props.onValueChange(true)
		check('a switch is saved', app.data.cache.guidelines === true)
		press(app.screen(), 'Self-check')
		check('the self-check finds the cropper and says no crop was done yet', has(app.screen(), '✓ Found the cropper') && has(app.screen(), '✗ A crop has been done'))
		const done = load({ again: false })
		await done.picker.openCropper(discordOptions())
		press(done.screen(), 'Self-check')
		check('after a crop the self-check says so and shows the options', has(done.screen(), '✓ A crop has been done') && has(done.screen(), 'Options the cropper got last time') && has(done.screen(), '"path":"file:///photos/a.jpg"'))
		check('...without Discord’s colours and texts', !has(done.screen(), 'cropperChooseColor'))
		press(done.screen(), 'Copy report')
		check('the report lists settings, hooks, counts and passes', /Crop Plus report/.test(global.copied) && /version: \d+\.\d+\.\d+/.test(global.copied) && /cropper found; patched: openCropper/.test(global.copied) && /crops 1, passes 1/.test(global.copied) && /last passes: 1000 × 800/.test(global.copied), global.copied)
		const none = load({}, { late: true })
		press(none.screen(), 'Self-check')
		check('without the cropper the self-check says so and the state says waiting', has(none.screen(), '✗ Found the cropper') && has(none.screen(), 'Waiting for the cropper'))
	}

	console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
	process.exit(failed ? 1 : 0)
})()
