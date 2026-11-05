// Mock tests for Status Presets. Run with: node tests/status-presets.test.cjs
// (build first: bun run build:dev, or just run `bun run test`). BUNDLE_DIR runs them against another build.
const { readBundleSource } = require('./lib/harness.cjs')
let failed = 0
const check = (name, ok, extra) => {
	console.log(`${ok ? 'ok   ' : 'FAIL '}${name}${ok || extra === undefined ? '' : `  -> ${extra}`}`)
	if (!ok) failed += 1
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A fake of Discord's proto settings: a value, getSetting and updateSetting (which records every call). */
function fakeSetting(initial, calls, name, options = {}) {
	const s = { value: initial, getSetting: () => s.value, useSetting: () => s.value }
	s.updateSetting = (v) => { calls.push([name, v]); if (options.refuse) return Promise.reject(new Error('nope')); if (!options.ignore) s.value = v; return Promise.resolve() }
	return s
}

// Hooks that remember their state per position in the tree, so screens can be tapped through.
const contexts = new Map()
let currentContext = null
const React = {
	useState: (initial) => {
		const ctx = currentContext
		const i = ctx.cursor++
		if (!(i in ctx.states)) ctx.states[i] = typeof initial === 'function' ? initial() : initial
		return [ctx.states[i], (v) => { ctx.states[i] = typeof v === 'function' ? v(ctx.states[i]) : v; ctx.dirty() }]
	},
	useEffect: () => {},
	cloneElement: (element, props, children) => ({ ...element, props: { ...element.props, ...props, ...(children !== undefined ? { children } : {}) } }),
}
function expandAt(node, pathKey, root) {
	if (Array.isArray(node)) return node.map((n, i) => expandAt(n, `${pathKey}/${(n && n.key) || i}`, root))
	if (!node || typeof node !== 'object') return node
	if (typeof node.type === 'function') {
		pathKey = `${pathKey}>${node.type.name}${node.key ? `#${node.key}` : ''}`
		let ctx = contexts.get(pathKey)
		if (!ctx) { ctx = { states: {}, cursor: 0, dirty: () => { root.dirty = true } }; contexts.set(pathKey, ctx) }
		ctx.cursor = 0
		const previous = currentContext
		currentContext = ctx
		const out = node.type(node.props)
		currentContext = previous
		return expandAt(out, pathKey, root)
	}
	return { ...node, props: { ...node.props, children: expandAt(node.props && node.props.children, `${pathKey}.${typeof node.type === 'string' ? node.type : 'x'}`, root) } }
}
const findAll = (tree, test, out = []) => { if (Array.isArray(tree)) tree.forEach((n) => findAll(n, test, out)); else if (tree && typeof tree === 'object') { if (test(tree)) out.push(tree); findAll(tree.props && tree.props.children, test, out) } return out }
const texts = (node, out = []) => {
	if (Array.isArray(node)) node.forEach((n) => texts(n, out))
	else if (typeof node === 'string') out.push(node)
	else if (node && typeof node === 'object') {
		const p = node.props || {}
		;['label', 'subLabel', 'text', 'title'].forEach((k) => { if (typeof p[k] === 'string') out.push(p[k]) })
		texts(p.children, out)
	}
	return out
}

/** Loads a fresh copy of the plugin against a fake Discord. */
function load(settings = {}, options = {}) {
	contexts.clear()
	const calls = []
	const mods = {
		StatusSetting: fakeSetting(options.status || 'online', calls, 'status', options),
		StatusExpiresAtSetting: fakeSetting('0', calls, 'expires', options),
		StatusCreatedAtSetting: fakeSetting('0', calls, 'created', options),
		CustomStatusSetting: fakeSetting(options.custom, calls, 'custom', options),
	}
	const runtime = { jsx: (type, props, key) => ({ type, props: props || {}, key }), jsxs: (type, props, key) => ({ type, props: props || {}, key }) }
	const toasts = []
	const hidden = []
	global.valenced = {
		react: { React, ReactNative: { View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', Vibration: { vibrate() {} } }, ReactJSXRuntime: runtime },
		externals: { ReactNativeClipboard: { Clipboard: { setString: (text) => { global.copied = text } } } },
		discord: {
			actions: { ToastActionCreators: { open: (k, o) => toasts.push(o.text) }, ActionSheetActionCreators: { hideAllActionSheets: () => hidden.push(1) }, ModalActionCreators: { pop: () => hidden.push('modal') } },
			design: { Design: new Proxy({}, { get: (_, key) => key }) },
			flux: { Stores: { SelfPresenceStore: { getStatus: () => mods.StatusSetting.value } } },
		},
		patcher: {
			after: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { const r = original.apply(this, a); const x = fn.call(this, r); return x === undefined ? r : x }; return () => { object[key] = original } },
			instead: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { return fn.call(this, a, original) }; return () => { object[key] = original } },
		},
		modules: {
			finders: {
				filters: { withProps: (...n) => n.join() },
				lookupModule: (f) => {
					if (f === 'jsx,jsxs') return [runtime]
					if (f === 'CustomStatusSetting,StatusSetting') return options.missing ? [] : [options.onDefault ? { default: mods } : mods]
					return []
				},
			},
		},
	}
	global.plugin = (definition) => definition
	const data = { cache: { ...settings } }
	const json = { get cache() { return data.cache }, use() { return data.cache }, set(patch) { Object.assign(data.cache, patch) } }
	const { source } = readBundleSource('status-presets')
	const plugin = new Function('valenced', 'plugin', `return ${source}`)(global.valenced, global.plugin).default
	plugin.start({ cleanup: (fn) => fn, jsonStorage: json })
	const screen = () => { const root = { dirty: false }; return expandAt({ type: plugin.SettingsComponent, props: { api: { jsonStorage: json } } }, 'root', root) }
	const presets = () => JSON.parse(data.cache.presetsJson === undefined ? '[]' : data.cache.presetsJson)
	return { plugin, data, json, runtime, calls, mods, toasts, hidden, screen, presets }
}
const press = (tree, label) => { const hit = findAll(tree, (n) => n.props && (n.props.label === label || n.props.text === label || (typeof n.props.label === 'string' && n.props.label.endsWith(` ${label}`))) && typeof n.props.onPress === 'function')[0]; if (!hit) throw new Error(`no pressable "${label}"`); hit.props.onPress() }
const tap = (tree, text) => { const hit = findAll(tree, (n) => n.type === 'Pressable' && texts(n).includes(text))[0]; if (!hit) throw new Error(`no chip "${text}"`); hit.props.onPress() }
const has = (tree, text) => texts(tree).some((t) => t.includes(text))

;(async () => {
	// 1. Starting up
	{
		const app = load()
		check('the plugin starts and finds the four status settings', /status settings: found/.test((() => { findAll(app.screen(), (n) => n.props && n.props.text === 'Copy report')[0].props.onPress(); return global.copied })()), global.copied)
		const onDefault = load({}, { onDefault: true })
		findAll(onDefault.screen(), (n) => n.props && n.props.text === 'Copy report')[0].props.onPress()
		check('...also when they sit on the module’s default object', /status settings: found/.test(global.copied), global.copied)
		const none = load({}, { missing: true })
		const tree = none.screen()
		check('if the settings are not found the screen still draws', has(tree, 'Busy'))
		press(tree, 'Busy')
		check('...and applying says so instead of crashing', none.toasts.some((t) => /Could not find/.test(t)), none.toasts.join('|'))
	}

	// 2. The starter presets
	{
		const app = load()
		const tree = app.screen()
		check('the starter presets are listed', ['Available', 'Busy', 'Away', 'Sleeping', 'Gaming', 'Invisible', 'Clear custom status'].every((n) => has(tree, n)))
		check('each row says what it does', has(tree, 'Do Not Disturb · “Sleeping” · 8 hours'), texts(tree).join('|'))
		check('"Right now" shows the current status', has(tree, 'Online') && has(tree, 'No custom status'))
	}

	// 3. Applying a preset
	{
		const app = load()
		const before = Date.now()
		press(app.screen(), '⛔ Busy')
		const status = app.calls.find((c) => c[0] === 'status')
		const expires = app.calls.find((c) => c[0] === 'expires')
		const custom = app.calls.find((c) => c[0] === 'custom')
		check('Busy sets Do Not Disturb', status && status[1] === 'dnd')
		check('...with an end time one hour away, as text', expires && /^\d+$/.test(expires[1]) && Math.abs(Number(expires[1]) - (before + 3600000)) < 5000, expires && expires[1])
		check('...a start time', app.calls.some((c) => c[0] === 'created' && /^\d+$/.test(c[1])))
		check('...and a custom status in the shape Discord uses', custom && custom[1].text === 'Busy, I will reply later' && custom[1].emojiName === '⛔' && custom[1].emojiId === '0' && custom[1].expiresAtMs === expires[1] && /^\d+$/.test(custom[1].createdAtMs), JSON.stringify(custom))
		check('a toast says the preset is on', app.toasts.includes('Busy is on'))
		check('the screen now marks Busy as Active', has(app.screen(), 'Active · Do Not Disturb'))
		await sleep(1300)
		check('a moment later it checks that Discord accepted it', has(app.screen(), 'Busy: applied'), texts(app.screen()).join('|'))

		const avail = load({}, { status: 'dnd', custom: { text: 'x', emojiName: '', emojiId: '0', expiresAtMs: '0' } })
		press(avail.screen(), '🟢 Available')
		check('Available turns Online on with no end time', avail.mods.StatusSetting.value === 'online' && avail.mods.StatusExpiresAtSetting.value === '0')
		check('...and removes the custom status', avail.mods.CustomStatusSetting.value === undefined)

		const inv = load({}, { custom: { text: 'keep me', emojiName: '', emojiId: '0', expiresAtMs: '0' } })
		press(inv.screen(), 'Invisible')
		check('Invisible leaves the custom status alone', inv.mods.StatusSetting.value === 'invisible' && !inv.calls.some((c) => c[0] === 'custom'))

		const clear = load({}, { status: 'idle', custom: { text: 'x', emojiName: '', emojiId: '0', expiresAtMs: '0' } })
		press(clear.screen(), '🧹 Clear custom status')
		check('Clear custom status changes only the custom status', clear.mods.CustomStatusSetting.value === undefined && !clear.calls.some((c) => c[0] === 'status'))

		const mid = load({ presetsJson: JSON.stringify([{ id: 'm', name: 'Night', text: 'Night', status: 'idle', custom: 'set', clearAfter: 'midnight' }]) })
		press(mid.screen(), 'Night')
		const end = new Date(Number(mid.mods.StatusExpiresAtSetting.value))
		check('"Until midnight" ends at the next 00:00', end.getHours() === 0 && end.getMinutes() === 0 && end.getTime() > Date.now() && end.getTime() - Date.now() <= 86400000, end.toString())

		const refused = load({}, { refuse: true })
		press(refused.screen(), 'Busy')
		await sleep(50)
		check('if Discord refuses, the screen log says so', has(refused.screen(), 'Discord refused'), texts(refused.screen()).join('|'))

		const ignored = load({}, { ignore: true })
		press(ignored.screen(), 'Busy')
		await sleep(1300)
		check('if Discord does not take the change, the log says it is not confirmed', has(ignored.screen(), 'asked, but') && ignored.toasts.some((t) => /not confirmed/.test(t)), texts(ignored.screen()).join('|'))
	}

	// 4. Undo
	{
		const app = load({}, { status: 'idle', custom: { text: 'reading', emojiName: '📚', emojiId: '0', expiresAtMs: '0' } })
		press(app.screen(), '⛔ Busy')
		check('before applying, the old status was saved', has(app.screen(), 'Undo “Busy”'))
		press(app.screen(), 'Undo “Busy”')
		check('Undo brings back the status', app.mods.StatusSetting.value === 'idle')
		check('...and the custom status with its emoji', app.mods.CustomStatusSetting.value && app.mods.CustomStatusSetting.value.text === 'reading' && app.mods.CustomStatusSetting.value.emojiName === '📚', JSON.stringify(app.mods.CustomStatusSetting.value))
		check('...and then there is nothing left to undo', has(app.screen(), 'Nothing to undo'))
		const noCustom = load({}, { status: 'online' })
		press(noCustom.screen(), 'Busy')
		press(noCustom.screen(), 'Undo “Busy”')
		check('undoing when you had no custom status removes the new one', noCustom.mods.CustomStatusSetting.value === undefined && noCustom.mods.StatusSetting.value === 'online')
	}

	// 5. Saving the current status, adding, editing, deleting
	{
		const app = load({}, { status: 'dnd', custom: { text: 'In a meeting', emojiName: '💼', emojiId: '0', expiresAtMs: '0' } })
		press(app.screen(), 'Save as preset')
		const saved = app.presets()
		const mine = saved[saved.length - 1]
		check('"Save as preset" copies status, text and emoji', mine.status === 'dnd' && mine.text === 'In a meeting' && mine.emoji === '💼' && mine.custom === 'set', JSON.stringify(mine))
		check('...and opens it for editing', has(app.screen(), 'All presets') && has(app.screen(), 'PREVIEW'))
		press(app.screen(), '‹ All presets')
		check('back goes to the list', has(app.screen(), 'PRESETS') && has(app.screen(), 'In a meeting'))

		// edit mode
		tap(app.screen(), 'Tap to edit')
		press(app.screen(), '💼 In a meeting')
		check('in edit mode a tap opens the preset instead of applying it', has(app.screen(), 'PREVIEW') && !app.calls.some((c) => c[0] === 'custom'))
		const tree = app.screen()
		const radio = findAll(tree, (n) => n.props && n.props.title === 'Online status')[0]
		radio.props.onChange('idle')
		const nameField = findAll(app.screen(), (n) => n.props && n.props.label === 'Name')[0]
		nameField.props.onChange('Meeting')
		press(app.screen(), 'Save')
		const after = app.presets().find((p) => p.id === mine.id)
		check('editing and Save keeps the changes', after && after.name === 'Meeting' && after.status === 'idle', JSON.stringify(after))
		check('...and the list shows them', has(app.screen(), 'Meeting'))
	}
	{
		const app = load()
		press(app.screen(), '＋ New preset')
		check('"New preset" opens an empty editor', has(app.screen(), 'NEW PRESET'))
		findAll(app.screen(), (n) => n.props && n.props.label === 'Text')[0].props.onChange('Lunch break')
		findAll(app.screen(), (n) => n.props && n.props.label === 'Emoji')[0].props.onChange('🍽️')
		findAll(app.screen(), (n) => n.props && n.props.title === 'Switch back after')[0].props.onChange('30m')
		press(app.screen(), 'Save')
		const lunch = app.presets().find((p) => p.text === 'Lunch break')
		check('a new preset gets a name from its text when none is typed', lunch && lunch.name === 'Lunch break' && lunch.emoji === '🍽️' && lunch.clearAfter === '30m', JSON.stringify(lunch))
		press(app.screen(), '🍽️ Lunch break')
		check('...and works', app.mods.CustomStatusSetting.value && app.mods.CustomStatusSetting.value.emojiName === '🍽️')

		const custom = load({ presetsJson: JSON.stringify([{ id: 'c', name: 'Server emoji', emoji: '<:wave:123456789012345678>', text: 'hi', status: 'keep', custom: 'set', clearAfter: 'never' }]) })
		press(custom.screen(), 'Server emoji')
		const v = custom.mods.CustomStatusSetting.value
		check('a server emoji is sent with its name and id', v && v.emojiName === 'wave' && v.emojiId === '123456789012345678', JSON.stringify(v))
		check('...and shows as :wave: in the list', has(custom.screen(), 'Server emoji'))
	}
	{
		// edit, move, duplicate, delete
		const app = load()
		tap(app.screen(), 'Tap to edit')
		press(app.screen(), '🟢 Available')
		press(app.screen(), '↓ Move down')
		const order = JSON.parse(app.data.cache.presetsJson).map((p) => p.name)
		check('Move down swaps with the next preset', order[0] === 'Busy' && order[1] === 'Available', order.join(','))
		press(app.screen(), 'Duplicate')
		check('Duplicate adds a copy', JSON.parse(app.data.cache.presetsJson).some((p) => p.name === 'Available copy'))
		tap(app.screen(), 'Tap to edit')
		press(app.screen(), '🟢 Available copy')
		const before = JSON.parse(app.data.cache.presetsJson).length
		press(app.screen(), 'Delete')
		check('Delete asks to tap again', JSON.parse(app.data.cache.presetsJson).length === before && has(app.screen(), 'Tap again to delete'))
		press(app.screen(), 'Tap again to delete')
		check('...and then deletes', JSON.parse(app.data.cache.presetsJson).length === before - 1)
		tap(app.screen(), 'Tap to edit')
		press(app.screen(), 'Reset to starter presets')
		check('Reset asks to tap again', JSON.parse(app.data.cache.presetsJson).length === before - 1 && has(app.screen(), 'Tap again to replace'))
		press(app.screen(), 'Tap again to replace all presets with the starter ones')
		check('...and then restores the seven starter presets', JSON.parse(app.data.cache.presetsJson).length === 7)
	}

	// 6. Bad saved data
	{
		const broken = load({ presetsJson: 'not json' })
		check('broken saved data falls back to the starter presets', has(broken.screen(), 'Busy'))
		const weird = load({ presetsJson: JSON.stringify([{ name: 5, status: 'sparkle', custom: 9, clearAfter: 'forever', text: 'x'.repeat(400) }, null, 'text']) })
		const tree = weird.screen()
		check('unknown values in a preset are replaced with safe ones', has(tree, 'Untitled') || has(tree, '5'))
		press(tree, '5')
		check('...and applying one does not crash or send nonsense', !weird.calls.some((c) => c[0] === 'status' && c[1] === 'sparkle'))
		const empty = load({ presetsJson: '[]' })
		check('an empty list is allowed and says so', has(empty.screen(), 'No presets yet'))
	}

	// 7. The status sheet
	{
		const app = load()
		const radioRow = (v) => app.runtime.jsx('Row', { label: v }, v)
		const group = app.runtime.jsx('Group', { children: ['online', 'idle', 'dnd', 'invisible'].map(radioRow) })
		const sheet = app.runtime.jsxs('View', { children: [app.runtime.jsx('Heading', {}), group] })
		check('presets are added under the status picker', sheet.props.children.length === 3 && typeof sheet.props.children[2].type === 'function', JSON.stringify(sheet.props.children.map((c) => c.type && (c.type.name || c.type))))
		const expanded = expandAt(sheet.props.children[2], 'sheet', { dirty: false })
		check('...listing the presets', has(expanded, 'Sleeping'))
		press(expanded, '😴 Sleeping')
		check('tapping one closes the sheet', app.hidden.length === 1)
		await sleep(5)
		check('...and applies it', app.mods.StatusSetting.value === 'dnd')
		const other = app.runtime.jsxs('View', { children: [app.runtime.jsx('Heading', {}), app.runtime.jsx('Group', { children: [app.runtime.jsx('Row', {}, 'a'), app.runtime.jsx('Row', {}, 'b')] })] })
		check('other sheets are left alone', other.props.children.length === 2)
		const again = app.runtime.jsxs('View', { children: [app.runtime.jsx('Heading', {}), app.runtime.jsx('Group', { children: ['online', 'idle', 'dnd', 'invisible'].map((v) => app.runtime.jsx('Row', {}, v)) })] })
		check('a second sheet is also handled', again.props.children.length === 3)
		const off = load({ inSheet: false })
		const sheet2 = off.runtime.jsxs('View', { children: [off.runtime.jsx('Heading', {}), off.runtime.jsx('Group', { children: ['online', 'idle', 'dnd', 'invisible'].map((v) => off.runtime.jsx('Row', {}, v)) })] })
		check('with the switch off the sheet is left alone', sheet2.props.children.length === 2)
		const newer = load()
		const stale = app.runtime.jsxs('View', { children: [app.runtime.jsx('Heading', {}), app.runtime.jsx('Group', { children: ['online', 'idle', 'dnd', 'invisible'].map((v) => app.runtime.jsx('Row', {}, v)) })] })
		check('an older copy of the plugin does nothing once a newer one is loaded', stale.props.children.length === 2)
	}

	// 7b. The "Set your status" screen
	{
		const app = load({}, { status: 'online' })
		const editor = () => {
			const row = app.runtime.jsx('Row', { label: 'Clear at', arrow: true, trailing: 'Don\'t clear' })
			return app.runtime.jsx('View', { children: [
				app.runtime.jsx('View', { children: 'preview' }),
				app.runtime.jsxs('View', { children: [app.runtime.jsx('Text', {}), app.runtime.jsx('View', {})] }),
				app.runtime.jsx('Group', { hasIcons: false, children: row }),
				app.runtime.jsx('Group', { hasIcons: true, children: app.runtime.jsx('Row', { label: 'Delete status' }) }),
			] })
		}
		const screen = editor()
		const kids = screen.props.children
		check('presets are added to the "Set your status" screen, between Clear at and Delete', kids.length === 5 && typeof kids[3].type === 'function' && kids[4].props.children.props.label === 'Delete status', JSON.stringify(kids.map((c) => c.type && (c.type.name || c.type))))
		const group = expandAt(kids[3], 'editor', { dirty: false })
		check('...listing the presets and a "save current status" row', has(group, 'Sleeping') && has(group, '＋ Save my current status as a preset'))
		press(group, '😴 Sleeping')
		check('tapping one applies it', app.mods.StatusSetting.value === 'dnd')
		await sleep(5)
		check('...and closes the screen', app.hidden.includes('modal'))
		press(group, '＋ Save my current status as a preset')
		check('"save current status" adds a preset', app.presets().length === 8)
		const noCustom = app.runtime.jsx('View', { children: [app.runtime.jsx('View', {}), app.runtime.jsxs('View', { children: [1, 2] }), app.runtime.jsx('Group', { hasIcons: false, children: app.runtime.jsx('Row', { arrow: true, trailing: 'x' }) })] })
		check('it also works when there is no "Delete status" group yet', noCustom.props.children.length === 4)
		const unrelated = app.runtime.jsx('View', { children: [app.runtime.jsx('A', {}), app.runtime.jsx('B', {}), app.runtime.jsx('Group', { hasIcons: false, children: app.runtime.jsx('Row', {}) })] })
		check('other screens are left alone', unrelated.props.children.length === 3)
		const copy = load()
		const e2 = copy.runtime.jsx('View', { children: [copy.runtime.jsx('View', {}), copy.runtime.jsxs('View', { children: [1, 2] }), copy.runtime.jsx('Group', { hasIcons: false, children: copy.runtime.jsx('Row', { arrow: true, trailing: 'x' }) })] })
		findAll(copy.screen(), (n) => n.props && n.props.label === 'Show presets on the “Set your status” screen')[0].props.onValueChange(false)
		const e3 = copy.runtime.jsx('View', { children: [copy.runtime.jsx('View', {}), copy.runtime.jsxs('View', { children: [1, 2] }), copy.runtime.jsx('Group', { hasIcons: false, children: copy.runtime.jsx('Row', { arrow: true, trailing: 'x' }) })] })
		check('the switch turns it off', e2.props.children.length === 4 && e3.props.children.length === 3)
		press(copy.screen(), 'Copy report')
		check('the report counts both screens', /"Set your status" screen seen: 2 time/.test(global.copied) && /account sheet seen: 0/.test(global.copied), global.copied)
	}

	// 8. Self-check and report
	{
		const app = load({}, { status: 'dnd' })
		press(app.screen(), 'Run the self-check')
		await sleep(700)
		const text = texts(app.screen()).join('|')
		check('the self-check finds the settings and passes the round trip', /✓ Found Discord’s status settings/.test(text) && /✓ Round trip/.test(text), text)
		check('...and says the sheets have not been opened yet', /✗ Account sheet found/.test(text))
		press(app.screen(), 'Copy report')
		check('the report lists version, presets, status and actions', /Status Presets report/.test(global.copied) && /version: \d+\.\d+\.\d+/.test(global.copied) && /my status now: Do Not Disturb/.test(global.copied), global.copied)
		const lost = load({}, { missing: true })
		press(lost.screen(), 'Run the self-check')
		await sleep(50)
		check('with nothing found the self-check says ✗', /✗ Found Discord’s status settings/.test(texts(lost.screen()).join('|')))
	}

	console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
	process.exit(failed ? 1 : 0)
})()
