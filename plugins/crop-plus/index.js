(function (exports) {
	/*
	 * Crop Plus for Valenced
	 *
	 * Discord's picture cropper (Edit image, then Scale and Crop) stops you from cropping small: the frame has a
	 * minimum size and the picture can only be zoomed so far. This plugin lets you crop again and again on the
	 * result, so every pass can go as small as the cropper allows and the passes add up. It can also set the
	 * cropper's options (grid, frame, rotation, starting shape) and shrink the result.
	 *
	 * How it works. The decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354) opens the
	 * cropper in `discord_app/modules/media_uploads/native/UploadPreviewActionSheet.tsx` with
	 *
	 *     ImagePicker.launchCropper({ uri, freeStyleCropEnabled: true, width, height })
	 *
	 * and `discord_app/modules/image/native/ImagePicker.tsx` turns that into the options of the native cropper
	 * (the react-native-image-crop-picker library, which uses uCrop on Android):
	 *
	 *     openPickerDefault.openCropper({ path, width, height, freeStyleCropEnabled, cropper...Color, ... })
	 *
	 * That native screen has a fixed smallest frame and a fixed biggest zoom, and the library has no option for
	 * them. This plugin wraps `openCropper`: it changes the options on the way in, and when the cropper returns
	 * a picture it can open the cropper again on that new picture. The picture that finally goes back to Discord is
	 * the last pass, in the same shape Discord expects (`path`, `width`, `height`, `mime`, `size`, `cropRect`).
	 *
	 * The file reads top to bottom:  1 Settings  2 The cropper hook  3 The "crop again" sheet  4 Settings screen
	 *                                5 Report and self-check  6 The plugin
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */

	const VERSION = '1.3.0'
	const INSTANCE = {}
	const SHEET_KEY = 'MARKLONG_CROP_PLUS_ASK'
	const CANCELLED = 'E_PICKER_CANCELLED'

	// ---------------------------------------------------------------------------------------------------
	// Small helpers
	// ---------------------------------------------------------------------------------------------------
	const parseJson = (text, fallback) => {
		try { const value = JSON.parse(text); return value === undefined || value === null ? fallback : value } catch (e) { return fallback }
	}
	const toast = (text) => {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_CROP_PLUS', { text: String(text) }) } catch (e) {}
	}
	function h(type, props, ...children) {
		const runtime = valenced.react.ReactJSXRuntime
		const { key, ...rest } = props || {}
		if (children.length === 1) rest.children = children[0]
		else if (children.length > 1) rest.children = children
		return (children.length > 1 ? runtime.jsxs : runtime.jsx)(type, rest, key)
	}
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
	const sizeText = (bytes) => {
		const n = Number(bytes)
		if (!Number.isFinite(n) || n <= 0) return ''
		return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
	}
	const dims = (r) => (r && r.width && r.height ? `${r.width} × ${r.height}` : 'unknown size')

	// ---------------------------------------------------------------------------------------------------
	// 1. Settings
	// ---------------------------------------------------------------------------------------------------
	const RATIOS = [
		{ v: 'discord', l: 'As Discord does it', s: 'The shape of the picture, with free resizing' },
		{ v: 'free', l: 'Free', s: 'No starting shape' },
		{ v: '1:1', l: 'Square 1:1', s: 'Emoji, profile pictures' },
		{ v: '4:3', l: '4:3' },
		{ v: '3:2', l: '3:2' },
		{ v: '16:9', l: '16:9' },
		{ v: '9:16', l: '9:16', s: 'Phone screen' },
	]
	const SIDES = [0, 128, 256, 512, 1024, 1600, 2048]
	const QUALITIES = [100, 95, 90, 80, 70, 60]
	const PASSES = [2, 3, 4, 6, 10, 15]
	const TARGETS = [16, 32, 64, 128, 256, 512, 1024]

	const defaults = {
		enabled: true,
		scope: 'attachments', // 'attachments': only the "Edit image" crop of a chat picture. 'everywhere': every crop, also profile pictures and icons
		again: true, // offer to crop again after each crop
		mode: 'ask', // 'ask': a sheet after each crop. 'auto': open the cropper again at once until the picture is small enough
		targetPx: 256, // 'auto' stops when the longest side is at most this many pixels
		askAbove: 0, // only ask when the longest side of the result is bigger than this many pixels (0 = always ask)
		maxPasses: 6, // how many crops in a row at most
		undoStack: true, // the sheet may go back to the pass before
		ratio: 'discord',
		freeStyle: true, // always let the frame change shape
		guidelines: false, // the 3x3 grid in the frame (library option showCropGuidelines)
		frame: true, // the frame border (showCropFrame)
		rotation: false, // two-finger rotation gesture (enableRotationGesture)
		bottomControls: true, // keep the Scale and Rotate tabs (hideBottomControls off)
		maxWidth: 0, // shrink the result to at most this wide (0 = do not shrink)
		maxHeight: 0,
		quality: 100, // JPEG quality of the result, in percent
		cleanTemp: true, // delete the pictures of earlier passes when done
		titles: true, // the cropper's title says which crop this is and how big the picture is
		tips: true, // a short tip when the first crop of the day opens
	}

	/** What "Smallest crop" sets: crop again and again, on its own, until the picture is tiny. */
	const SMALLEST = { enabled: true, again: true, mode: 'auto', targetPx: 32, maxPasses: 15, scope: 'attachments', freeStyle: true, ratio: 'free', bottomControls: true, askAbove: 0, maxWidth: 0, maxHeight: 0, quality: 100 }

	let storage
	let screenListeners = []
	const redrawSettings = () => screenListeners.slice().forEach((redraw) => { try { redraw() } catch (e) {} })
	function setting(key) {
		const saved = storage && storage.cache && storage.cache[key]
		return saved !== undefined ? saved : defaults[key]
	}
	function saveSettings(patch) {
		try { if (storage && typeof storage.set === 'function') storage.set(patch) } catch (e) {}
		try { if (storage && storage.cache) Object.assign(storage.cache, patch) } catch (e) {}
		redrawSettings()
	}

	const hooks = { cropper: 'not found', patched: [], problems: [] }
	const stats = { crops: 0, passes: 0, extra: 0, shrunk: 0, cancelled: 0, skipped: 0 }
	const log = []
	function addLog(text, ok = true) {
		log.unshift({ at: Date.now(), text, ok })
		if (log.length > 12) log.length = 12
		redrawSettings()
	}
	const problem = (what, error) => {
		const text = `${what}: ${(error && error.message) || error}`
		if (!hooks.problems.includes(text)) hooks.problems.push(text)
		addLog(text, false)
	}
	let lastOptions = null // the options of the last crop as the cropper got them, without colours and texts
	let lastResults = [] // what each pass of the last crop returned

	// ---------------------------------------------------------------------------------------------------
	// 2. The cropper hook
	// ---------------------------------------------------------------------------------------------------
	/** True when this crop is one the plugin should work on (Discord's "Edit image" crop is free-style). */
	function inScope(options) {
		if (!setting('enabled')) return false
		return setting('scope') === 'everywhere' || !!(options && options.freeStyleCropEnabled)
	}

	/**
	 * The options for the cropper: Discord's, changed by the settings. A copy: the object Discord passed is not touched.
	 * `previous` is the result of an earlier pass when this is a later one: then the picture to crop is that result
	 * and the starting shape follows its size instead of the original's.
	 */
	function tuneOptions(options, previous, pass) {
		const next = { ...options }
		if (previous) { next.path = previous.path; next.uri = undefined; next.width = previous.width || undefined; next.height = previous.height || undefined }
		if (previous && pass && setting('titles')) next.cropperToolbarTitle = `Crop ${pass} · ${dims(previous)}`
		if (setting('freeStyle')) next.freeStyleCropEnabled = true
		const ratio = setting('ratio')
		if (ratio === 'free') { next.width = undefined; next.height = undefined }
		else if (ratio !== 'discord') {
			const [w, h2] = String(ratio).split(':').map(Number)
			if (w > 0 && h2 > 0) { next.width = w * 1000; next.height = h2 * 1000 }
		}
		next.showCropGuidelines = !!setting('guidelines')
		next.showCropFrame = !!setting('frame')
		next.enableRotationGesture = !!setting('rotation')
		next.hideBottomControls = !setting('bottomControls')
		const maxWidth = Number(setting('maxWidth')) || 0
		const maxHeight = Number(setting('maxHeight')) || 0
		if (maxWidth > 0) next.compressImageMaxWidth = maxWidth
		if (maxHeight > 0) next.compressImageMaxHeight = maxHeight
		const quality = Number(setting('quality')) || 100
		if (quality < 100) next.compressImageQuality = quality / 100
		return next
	}
	const plainOptions = (options) => {
		const keep = {}
		Object.keys(options || {}).forEach((key) => { if (!/^cropper/.test(key)) keep[key] = typeof options[key] === 'string' && options[key].length > 60 ? `${options[key].slice(0, 40)}...` : options[key] })
		return keep
	}

	/** One pass of the cropper. A cancel is returned as null, not thrown. */
	async function onePass(holder, original, options) {
		try {
			return await Reflect.apply(original, holder, [options])
		} catch (error) {
			if (error && error.code === CANCELLED) return null
			throw error
		}
	}
	const cancelError = () => { const error = new Error('User cancelled image selection'); error.code = CANCELLED; return error }

	/** Runs the cropper, and again on its result while the person asks for it. */
	async function cropWithPasses(holder, original, args) {
		const options = args[0] || {}
		const stack = [] // results of the passes so far; stack[0] is the first pass
		const limit = Math.max(1, Number(setting('maxPasses')) || 1)
		lastOptions = plainOptions(tuneOptions(options, null))
		lastResults = []
		stats.crops += 1
		let crop = true // false after "go back": the sheet is shown again for the earlier result
		for (;;) {
			if (crop) {
				if (!stack.length) showTip()
				const result = await onePass(holder, original, tuneOptions(options, stack.length ? stack[stack.length - 1] : null, stack.length + 1))
				if (!result) {
					// Cancelled. On the first pass that is a real cancel. Later it means "keep what I had".
					if (!stack.length) { stats.cancelled += 1; addLog('Crop cancelled'); throw cancelError() }
					addLog('Cancelled the extra crop, kept the last result')
					break
				}
				stats.passes += 1
				if (stack.length) stats.extra += 1
				stack.push(result)
				lastResults.push(`${dims(result)} ${sizeText(result.size)}`.trim())
				if (Number(setting('quality')) < 100 || Number(setting('maxWidth')) > 0 || Number(setting('maxHeight')) > 0) stats.shrunk += 1
			}
			if (crop && setting('again') && setting('mode') === 'auto') {
				// No sheet: open the cropper again at once until the picture is small enough. Cancelling the cropper keeps the last result.
				const last = stack[stack.length - 1]
				const longest = Math.max(Number(last.width) || 0, Number(last.height) || 0)
				if (longest > 0 && longest <= (Number(setting('targetPx')) || 256)) { addLog(`Small enough: ${dims(last)}`); break }
				if (stack.length >= limit) { addLog(`Stopped after ${limit} crops (the limit in the settings)`); break }
				toast(`Crop ${stack.length + 1}: now ${dims(last)}. Pick a smaller part, or Cancel to keep this.`)
				await sleep(450)
				continue
			}
			if (crop && !wantsAnother(stack[stack.length - 1], stack.length, limit)) break
			const choice = await askAgain(stack)
			if (choice === 'done') break
			if (choice === 'cancel') { cleanAll(holder, stack, null); stats.cancelled += 1; addLog('Crop cancelled from the sheet'); throw cancelError() }
			if (choice === 'undo' && stack.length > 1) { cleanOne(holder, stack.pop()); crop = false; continue }
			if (stack.length >= limit) { addLog(`Stopped after ${limit} crops (the limit in the settings)`); break }
			crop = true
			await sleep(350) // the native cropper screen needs a moment to be gone before it can open again
		}
		const final = stack[stack.length - 1]
		if (setting('cleanTemp')) cleanAll(holder, stack, final)
		addLog(`Crop done: ${stack.length} pass${stack.length === 1 ? '' : 'es'}, ${dims(final)} ${sizeText(final.size)}`.trim())
		return final
	}

	let tipShown = false
	/** Said once per start of Discord, when the first crop opens. */
	function showTip() {
		if (tipShown || !setting('tips') || !setting('again')) return
		tipShown = true
		toast(setting('mode') === 'auto'
			? 'Crop Plus: pick an area and tap the check mark. The cropper opens again on the result. Tap the X when it is small enough. Tip: pinch to zoom in first.'
			: 'Crop Plus: pick an area and tap the check mark. A sheet then offers to crop smaller. Tip: pinch to zoom in first.')
	}

	/** True when the sheet should be shown after this pass. */
	function wantsAnother(result, passes, limit) {
		if (!setting('again')) { stats.skipped += 1; return false }
		if (passes >= limit) { addLog(`Stopped after ${limit} crops (the limit in the settings)`); return false }
		const above = Number(setting('askAbove')) || 0
		const longest = Math.max(Number(result.width) || 0, Number(result.height) || 0)
		if (above > 0 && longest > 0 && longest <= above) { stats.skipped += 1; return false }
		return true
	}
	function cleanOne(holder, result) {
		try { if (result && result.path && typeof holder.cleanSingle === 'function') holder.cleanSingle(result.path) } catch (e) {}
	}
	function cleanAll(holder, stack, keep) {
		stack.forEach((result) => { if (result !== keep) cleanOne(holder, result) })
	}

	function hookCropper(cleanup) {
		const finders = valenced.modules.finders
		const attach = (mod) => {
			;[mod, mod && mod.default].filter((m, i, all) => m && (typeof m === 'object' || typeof m === 'function') && all.indexOf(m) === i).forEach((holder) => {
				if (typeof holder.openCropper !== 'function' || patched.has(holder)) return
				patched.add(holder)
				cleanup(valenced.patcher.instead(holder, 'openCropper', function (args, original) {
					try {
						if (globalThis.__cropPlusInstance !== INSTANCE || !inScope(args[0])) return Reflect.apply(original, this, args)
						return cropWithPasses(holder, original, args)
					} catch (e) {
						problem('crop', e)
						return Reflect.apply(original, this, args)
					}
				}))
				hooks.cropper = 'found'
				if (!hooks.patched.includes('openCropper')) hooks.patched.push('openCropper')
			})
		}
		const patched = new WeakSet()
		const run = (mod) => { try { attach(mod) } catch (e) { problem('hook openCropper', e) } }
		try { if (typeof finders.getModules === 'function') cleanup(finders.getModules(finders.filters.withProps('openCropper', 'openPicker'), run)) } catch (e) { problem('watch openCropper', e) }
		try { const found = finders.lookupModule(finders.filters.withProps('openCropper', 'openPicker'))[0]; if (found) run(found) } catch (e) {}
	}

	// ---------------------------------------------------------------------------------------------------
	// 3. The "crop again" sheet
	// ---------------------------------------------------------------------------------------------------
	let answerWith = null
	/** Shows the sheet and waits for a choice: 'again', 'done', 'undo' or 'cancel'. Closing the sheet means 'done'. */
	function askAgain(stack) {
		return new Promise((resolve) => {
			let settled = false
			const finish = (choice) => { if (settled) return; settled = true; answerWith = null; try { valenced.discord.actions.ActionSheetActionCreators.hideActionSheet(SHEET_KEY) } catch (e) {} ; resolve(choice) }
			answerWith = finish
			try {
				valenced.discord.actions.ActionSheetActionCreators.openLazy(Promise.resolve({ default: function () { return h(AskSheet, { stack, finish }) } }), SHEET_KEY, {})
			} catch (e) {
				problem('crop again sheet', e)
				finish('done')
			}
		})
	}

	function AskSheet({ stack, finish }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		React.useEffect(() => () => { if (answerWith === finish) finish('done') }, [])
		const last = stack[stack.length - 1]
		const before = stack.length > 1 ? stack[stack.length - 2] : null
		const uri = last && (last.path || last.uri)
		return h(
			Design.ActionSheet,
			null,
			h(
				RN.View,
				{ style: { padding: 16, gap: 12 } },
				h(Design.Text, { variant: 'heading-lg/bold' }, 'Crop smaller?'),
				h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, `Crop ${stack.length}: ${dims(last)}${last && last.size ? ` · ${sizeText(last.size)}` : ''}. Crop again to go smaller. Each crop starts from the picture you just made.`),
				uri ? h(RN.View, { style: { height: 170, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1e1f22', alignItems: 'center', justifyContent: 'center' } }, h(RN.Image, { source: { uri }, style: { width: '100%', height: '100%' }, resizeMode: 'contain' })) : null,
				h(Design.Button, { text: 'Crop smaller', variant: 'primary', onPress: () => finish('again') }),
				h(Design.Button, { text: 'Use this one', variant: 'secondary', onPress: () => finish('done') }),
				before && setting('undoStack') ? h(Design.Button, { text: `Go back to ${dims(before)}`, variant: 'secondary', size: 'sm', onPress: () => finish('undo') }) : null,
				h(Design.Button, { text: 'Cancel (keep the original)', variant: 'destructive', size: 'sm', onPress: () => finish('cancel') }),
			),
		)
	}

	// ---------------------------------------------------------------------------------------------------
	// 4. Settings screen
	// ---------------------------------------------------------------------------------------------------
	function Card({ children }) {
		const { View } = valenced.react.ReactNative
		return h(View, { style: { borderRadius: 14, padding: 14, gap: 10, backgroundColor: '#2b2d31' } }, children)
	}
	function Pill({ text, color }) {
		const { View } = valenced.react.ReactNative
		const { Text } = valenced.discord.design.Design
		return h(View, { style: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: `${color}33` } }, h(Text, { variant: 'text-xs/bold', style: { color } }, text))
	}
	function Chip({ text, selected, onPress }) {
		const { Pressable, View } = valenced.react.ReactNative
		const { Text } = valenced.discord.design.Design
		return h(Pressable, { onPress, accessibilityRole: 'button' }, h(View, { style: { minHeight: 36, minWidth: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: selected ? '#5865f2' : '#383a40' } }, h(Text, { variant: 'text-sm/semibold', style: { color: '#fff' } }, text)))
	}
	function Radio({ title, value, items, onChange }) {
		const Design = valenced.discord.design.Design
		return h(Design.TableRadioGroup, { title, value, onChange }, items.map((item) => h(Design.TableRadioRow, { key: String(item.v), label: item.l, subLabel: item.s, value: item.v })))
	}
	/** A row of chips for picking a number. */
	function Picker({ title, subtitle, value, options, format, onPick }) {
		const { ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		return h(RN.View, { style: { gap: 8, paddingHorizontal: 4 } },
			h(Design.Text, { variant: 'text-sm/semibold', color: 'text-muted' }, title),
			subtitle ? h(Design.Text, { variant: 'text-xs/medium', color: 'text-muted' }, subtitle) : null,
			h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } }, ...options.map((option) => h(Chip, { key: String(option), text: format ? format(option) : String(option), selected: Number(value) === option, onPress: () => onPick(option) }))))
	}

	function SettingsScreen({ api }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		storage = api.jsonStorage
		storage.use()
		const [, setRedraws] = React.useState(0)
		const [checks, setChecks] = React.useState(null)
		React.useEffect(() => {
			const redraw = () => setRedraws((n) => n + 1)
			screenListeners.push(redraw)
			return () => { screenListeners = screenListeners.filter((l) => l !== redraw) }
		}, [])
		const on = !!setting('enabled')
		const state = !on ? { text: 'Off', color: '#80848e' } : hooks.cropper !== 'found' ? { text: 'Waiting for the cropper', color: '#f0b232' } : { text: 'On', color: '#23a55a' }
		const switchRow = (key, label, subLabel) => h(Design.TableSwitchRow, { key, label, subLabel, value: !!setting(key), onValueChange: (value) => saveSettings({ [key]: !!value }) })
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 20, paddingHorizontal: 12 }, spacing: 22 },
				h(Card, { key: 'top' },
					h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', gap: 10 } }, h(Design.Text, { variant: 'heading-lg/bold' }, `Crop Plus ${VERSION}`), h(Pill, { text: state.text, color: state.color })),
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, `${stats.crops} crop${stats.crops === 1 ? '' : 's'} so far, ${stats.extra} extra pass${stats.extra === 1 ? '' : 'es'}. To use it: add a picture, tap it, choose Edit image, crop, and a sheet offers to crop smaller.`),
					h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Self-check', variant: 'primary', size: 'sm', onPress: () => setChecks(runSelfCheck()) })),
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Copy report', variant: 'secondary', size: 'sm', onPress: () => copyReport() })))),
				h(Card, { key: 'smallest' },
					h(Design.Text, { variant: 'text-md/bold' }, 'Need a really small crop?'),
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'One tap sets this up: crop again and again on its own until the picture is 32 px or less, no starting shape, up to 15 crops. Each crop starts from the last one, so the area you pick shrinks every time. Tap Cancel in the cropper when it is small enough.'),
					h(Design.Button, { text: 'Set up for the smallest crop', variant: 'primary', size: 'sm', onPress: () => { saveSettings(SMALLEST); toast('Done. Add a picture, tap Edit image and crop it.') } })),
				h(Design.TableRowGroup, { key: 'general', title: 'General' },
					switchRow('enabled', 'Crop Plus', 'The main switch'),
					switchRow('again', 'Crop again', 'After each crop, crop the result again so the passes add up'),
				),
				setting('again') && h(Radio, { key: 'mode', title: 'How it goes on', value: setting('mode'), onChange: (v) => saveSettings({ mode: v }), items: [
					{ v: 'ask', l: 'Ask me after each crop', s: 'A sheet: crop smaller, use this one, go back or cancel' },
					{ v: 'auto', l: 'Keep going until it is small', s: 'The cropper opens again at once. Tap Cancel in it to keep the last result' },
				] }),
				setting('again') && setting('mode') === 'auto' && h(Picker, { key: 'target', title: 'Stop when the longest side is at most', value: setting('targetPx'), options: TARGETS, format: (v) => `${v}px`, onPick: (v) => saveSettings({ targetPx: v }) }),
				h(Radio, { key: 'scope', title: 'Where it works', value: setting('scope'), onChange: (v) => saveSettings({ scope: v }), items: [
					{ v: 'attachments', l: 'Pictures you send', s: 'The Edit image crop of an attachment' },
					{ v: 'everywhere', l: 'Every crop', s: 'Also profile pictures, server icons and so on' },
				] }),
				h(Picker, { key: 'passes', title: 'Most crops in a row', value: setting('maxPasses'), options: PASSES, onPick: (v) => saveSettings({ maxPasses: v }) }),
				h(Picker, { key: 'above', title: 'Only ask when the picture is bigger than', subtitle: 'The longest side, in pixels. 0 asks after every crop', value: setting('askAbove'), options: [0, 256, 512, 1024, 2048], format: (v) => (v ? `${v}px` : 'Always'), onPick: (v) => saveSettings({ askAbove: v }) }),
				h(Design.TableRowGroup, { key: 'extra', title: 'The sheet' },
					switchRow('undoStack', 'Allow going back one crop', 'Shows "Go back to ..." from the second crop on'),
					switchRow('cleanTemp', 'Delete the pictures of earlier crops', 'When you are done, only the last one is kept'),
					switchRow('titles', 'Show the crop number in the title', 'The cropper\u2019s title says "Crop 2 · 500 × 400" from the second crop on'),
					switchRow('tips', 'Show a tip when the cropper opens', 'Once each time Discord starts'),
				),
				h(Radio, { key: 'ratio', title: 'Starting shape of the frame', value: setting('ratio'), onChange: (v) => saveSettings({ ratio: v }), items: RATIOS }),
				h(Design.TableRowGroup, { key: 'look', title: 'The cropper' },
					switchRow('freeStyle', 'Free resizing', 'The frame can be dragged to any shape'),
					switchRow('guidelines', 'Grid lines', 'Thirds inside the frame'),
					switchRow('frame', 'Frame border', 'The line around the frame'),
					switchRow('rotation', 'Rotate with two fingers', 'The Rotate tab always works'),
					switchRow('bottomControls', 'Scale and Rotate tabs', 'Keep the controls at the bottom'),
				),
				h(Picker, { key: 'maxWidth', title: 'Shrink the result: widest', subtitle: 'Pictures bigger than this are scaled down. 0 does not shrink', value: setting('maxWidth'), options: SIDES, format: (v) => (v ? `${v}px` : 'No limit'), onPick: (v) => saveSettings({ maxWidth: v }) }),
				h(Picker, { key: 'maxHeight', title: 'Shrink the result: tallest', value: setting('maxHeight'), options: SIDES, format: (v) => (v ? `${v}px` : 'No limit'), onPick: (v) => saveSettings({ maxHeight: v }) }),
				h(Picker, { key: 'quality', title: 'Quality of the result', subtitle: 'Lower is a smaller file', value: setting('quality'), options: QUALITIES, format: (v) => `${v}%`, onPick: (v) => saveSettings({ quality: v }) }),
				checks && h(Design.TableRowGroup, { key: 'checks', title: 'Self-check' },
					...checks.map((c, i) => h(Design.TableRow, { key: `c${i}`, label: `${c.ok ? '✓' : '✗'} ${c.label}`, subLabel: c.detail || undefined })),
				),
				log.length > 0 && h(Design.TableRowGroup, { key: 'log', title: 'Last actions' },
					...log.slice(0, 6).map((l, i) => h(Design.TableRow, { key: `l${i}`, label: `${l.ok ? '✓' : '✗'} ${l.text}`, subLabel: new Date(l.at).toLocaleTimeString() })),
				),
				h(Design.TableRowGroup, { key: 'good', title: 'Good to know' },
					h(Design.TableRow, { key: 'g0', label: 'The frame cannot get smaller', subLabel: 'Discord\u2019s cropper has a smallest frame (about 100 dp) that no plugin can change. What helps: pinch to zoom into the picture so the frame covers less, then tap the check mark. Crop Plus opens the cropper again on the result. The X on the first crop cancels everything; on later crops it keeps the last result.' }),
					h(Design.TableRow, { key: 'g1', label: 'Why crop again', subLabel: 'Discord’s cropper has a smallest frame and a biggest zoom. Cropping the result again starts from a smaller picture, so the passes add up.' }),
					h(Design.TableRow, { key: 'g2', label: 'Quality', subLabel: 'Each pass saves the picture again. Keep the quality at 100% unless you need a small file.' }),
				),
			),
		)
	}

	// ---------------------------------------------------------------------------------------------------
	// 5. Report and self-check
	// ---------------------------------------------------------------------------------------------------
	function runSelfCheck() {
		const out = []
		const add = (ok, label, detail) => out.push({ ok, label, detail })
		add(hooks.cropper === 'found', 'Found the cropper', hooks.cropper === 'found' ? 'openCropper is wrapped' : 'Open a picture’s crop once, then run this again')
		add(!!(valenced.discord.actions && valenced.discord.actions.ActionSheetActionCreators), 'Can show the "crop again" sheet', 'ActionSheetActionCreators')
		add(stats.crops > 0, 'A crop has been done', stats.crops > 0 ? `${stats.crops} crop(s), ${stats.passes} pass(es), ${stats.extra} extra` : 'Add a picture, tap it, choose Edit image and crop it')
		if (lastOptions) add(true, 'Options the cropper got last time', JSON.stringify(lastOptions))
		if (lastResults.length) add(true, 'Passes of the last crop', lastResults.join(' → '))
		return out
	}
	function buildReport() {
		return [
			'Crop Plus report',
			`version: ${VERSION}`,
			`enabled: ${setting('enabled')}; scope: ${setting('scope')}; offer again: ${setting('again')} (${setting('mode')}, target ${setting('targetPx')}px); most passes: ${setting('maxPasses')}; ask above: ${setting('askAbove')}`,
			`shape: ${setting('ratio')}; free ${setting('freeStyle')}; grid ${setting('guidelines')}; frame ${setting('frame')}; rotation ${setting('rotation')}; bottom controls ${setting('bottomControls')}`,
			`shrink: ${setting('maxWidth') || '-'} x ${setting('maxHeight') || '-'}; quality ${setting('quality')}%; clean ${setting('cleanTemp')}`,
			`hooks: cropper ${hooks.cropper}; patched: ${hooks.patched.join(', ') || '-'}`,
			`crops ${stats.crops}, passes ${stats.passes}, extra passes ${stats.extra}, cancelled ${stats.cancelled}, skipped sheet ${stats.skipped}`,
			lastOptions ? `last options: ${JSON.stringify(lastOptions)}` : 'last options: none yet',
			lastResults.length ? `last passes: ${lastResults.join(' -> ')}` : 'last passes: none yet',
			hooks.problems.length ? `problems: ${hooks.problems.join(' | ')}` : '',
		].filter(Boolean).join('\n')
	}
	function copyReport() {
		try {
			valenced.externals.ReactNativeClipboard.Clipboard.setString(buildReport())
			toast('Report copied. Paste it in the chat.')
		} catch (e) { toast('Could not copy') }
	}

	// ---------------------------------------------------------------------------------------------------
	// 6. The plugin
	// ---------------------------------------------------------------------------------------------------
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsScreen,
		start(api) {
			storage = api.jsonStorage
			globalThis.__cropPlusInstance = INSTANCE
			try { hookCropper(api.cleanup) } catch (e) { problem('start', e) }
			api.cleanup(() => {
				screenListeners = []
				if (answerWith) { try { answerWith('done') } catch (e) {} }
				if (globalThis.__cropPlusInstance === INSTANCE) globalThis.__cropPlusInstance = undefined
			})
		},
	})
	return exports
})({})
