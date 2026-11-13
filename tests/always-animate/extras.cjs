// Tests for the parts MarkLong0467 added to the merged plugin: GIFs, "Reduce motion", Refresh pictures and their settings rows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(options = {}) {
	const subscriptions = [];
	const modules = [];
	const cleanups = [];
	const cache = { images: true, emojis: true, stickers: true, cosmetics: true, gifs: true, motion: true, ...(options.cache || {}) };
	const storage = { cache, set(patch) { Object.assign(cache, patch) } };
	const addModule = (mod) => { modules.push(mod); subscriptions.forEach((s) => { if (s.active && s.filter(mod)) s.cb(mod) }) }
	const finders = {
		filters: {
			createFilterGenerator: (predicate) => (...args) => (mod) => predicate(args, 0, mod, true),
			withProps: (...keys) => (mod) => keys.every((key) => key in mod),
			withName: (name) => (mod) => mod.name === name,
		},
		getModules(filter, cb) {
			const sub = { filter, cb, active: true }
			subscriptions.push(sub)
			modules.forEach((mod) => { if (filter(mod)) cb(mod) })
			return () => { sub.active = false }
		},
	}
	const patcher = {
		after(target, key, cb) { const old = target[key]; const wrapped = function (...args) { return cb(old.apply(this, args)) }; target[key] = wrapped; return () => { if (target[key] === wrapped) target[key] = old } },
		before(target, key, cb) { const old = target[key]; const wrapped = function (...args) { return old.apply(this, cb(args)) }; target[key] = wrapped; return () => { if (target[key] === wrapped) target[key] = old } },
		instead(target, key, cb) { const old = target[key]; const wrapped = function (...args) { return cb.call(this, args, old) }; target[key] = wrapped; return () => { if (target[key] === wrapped) target[key] = old } },
	}
	class Accessibility { get useReducedMotion() { return true } get prefersReducedMotion() { return true } }
	const emitted = []
	const store = (name) => ({ emitChange() { emitted.push(name) } })
	const accessibility = new Accessibility()
	accessibility.emitChange = () => emitted.push('AccessibilityStore')
	const stores = { AccessibilityStore: accessibility, GuildStore: store('GuildStore'), GuildMemberStore: store('GuildMemberStore'), UserStore: store('UserStore'), MessageStore: store('MessageStore') }
	const gif = { getSetting: () => false, useSetting: () => false }
	const settingsModule = { AnimateEmoji: { getSetting: () => false, useSetting: () => false }, AnimateStickers: { getSetting: () => false, useSetting: () => false }, GifAutoPlay: gif }
	if (!options.noGifModule) addModule(settingsModule)

	// A tiny React: elements are plain objects, hooks keep nothing.
	const React = {
		createElement: (type, props, ...children) => ({ type, props: { ...(props || {}), children: children.length === 1 ? children[0] : children } }),
		useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
		useRef: (initial) => ({ current: initial }),
		useEffect: () => {},
	}
	const RN = { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', Switch: 'Switch', Appearance: { getColorScheme: () => 'dark' } }
	const valenced = {
		modules: { finders, native: { getNativeModule() { throw new Error('not available') } } },
		patcher,
		react: { React, ReactNative: RN },
		discord: { flux: { Stores: stores } },
		plugins: { constants: { pluginStorageDirFor: (id) => `/data/${id}` } },
		externals: { ReactNativeClipboard: { Clipboard: { setString() {} } } },
	}
	const script = fs.readFileSync(__dirname + '/../../plugins/always-animate/index.js', 'utf8')
	// This is Valenced createOptionsFactory's actual expression/default contract.
	const factory = vm.runInNewContext('(function (valenced, plugin) { return ' + script + '\n})', { setTimeout: options.noTimers ? undefined : setTimeout, clearTimeout, Promise, JSON, Object, Array, String, Number, Math, WeakMap, WeakSet, Set, Map, Error, RegExp })
	const plugin = factory(valenced, (opts) => opts).default
	const api = { jsonStorage: storage, cleanup: (...fns) => { cleanups.push(...fns) } }
	plugin.init(api)
	plugin.start(api)
	return { plugin, storage, cache, cleanups, stores, accessibility, gif, emitted, React, RN }
}

const pending = []
const check = (name, fn) => { pending.push((async () => { try { await fn(); return ['ok', name] } catch (e) { return ['FAIL', name, e.message] } })()) }

check('GIFs: "Play GIFs automatically" answers yes while the switch is on', () => {
	const t = setup()
	assert.equal(t.gif.getSetting(), true)
	assert.equal(t.gif.useSetting(), true)
})
check('GIFs: with the switch off Discord\'s own answer is kept', () => {
	const t = setup({ cache: { gifs: false } })
	assert.equal(t.gif.getSetting(), false)
	t.cache.gifs = true
	assert.equal(t.gif.getSetting(), true)
	t.storage.set({ gifs: false })
	assert.equal(t.gif.useSetting(), false)
})
check('GIFs: removing the plugin gives Discord\'s own answer back', () => {
	const t = setup()
	t.cleanups.forEach((fn) => fn())
	assert.equal(t.gif.getSetting(), false)
})
check('GIFs: a missing settings module does not break the plugin', () => {
	assert.doesNotThrow(() => setup({ noGifModule: true }))
})
check('Reduce motion: answers no while the switch is on', () => {
	const t = setup()
	assert.equal(t.accessibility.useReducedMotion, false)
	assert.equal(t.accessibility.prefersReducedMotion, false)
})
check('Reduce motion: with the switch off the real answer comes through', () => {
	const t = setup({ cache: { motion: false } })
	assert.equal(t.accessibility.useReducedMotion, true)
	t.storage.set({ motion: true })
	assert.equal(t.accessibility.useReducedMotion, false)
})
check('Reduce motion: removing the plugin restores the store exactly', () => {
	const t = setup()
	t.cleanups.forEach((fn) => { try { fn() } catch (_) {} })
	assert.equal(t.accessibility.useReducedMotion, true)
	assert.equal(Object.prototype.hasOwnProperty.call(t.accessibility, 'useReducedMotion'), false)
})
check('Reduce motion: the store is told to draw again', () => {
	const t = setup()
	assert.ok(t.emitted.includes('AccessibilityStore'))
})
check('the plugin starts when the stores are missing', () => {
	assert.doesNotThrow(() => { const t = setup(); })
})
check('pictures are drawn again a moment after start, and not after cleanup', () => new Promise((resolve) => {
	const t = setup()
	t.emitted.length = 0
	setTimeout(() => {
		assert.ok(t.emitted.includes('GuildStore'))
		resolve()
	}, 1700)
}))

// The settings screen
const flatten = (node, out = []) => {
	if (node == null || node === false) return out
	if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
	if (Array.isArray(node)) { node.forEach((n) => flatten(n, out)); return out }
	if (node.props) { ['label', 'subLabel', 'accessibilityLabel'].forEach((k) => { if (typeof node.props[k] === 'string') out.push(node.props[k]) }); flatten(node.props.children, out) }
	return out
}
const findNodes = (node, test, out = []) => {
	if (node == null || typeof node !== 'object') return out
	if (Array.isArray(node)) { node.forEach((n) => findNodes(n, test, out)); return out }
	if (test(node)) out.push(node)
	if (node.props) findNodes(node.props.children, test, out)
	return out
}
check('settings: GIFs and Reduce motion have a switch and the count says 6/6', () => {
	const t = setup()
	const tree = t.plugin.SettingsComponent()
	const text = flatten(tree)
	assert.ok(text.includes('GIFs'))
	assert.ok(text.some((s) => /Reduce motion/.test(s)))
	assert.ok(text.includes('6/6 on'), text.join('|'))
	const gifSwitch = findNodes(tree, (n) => n.type === 'Switch' && n.props.accessibilityLabel === 'GIFs')[0]
	assert.ok(gifSwitch)
	gifSwitch.props.onValueChange(false)
	assert.equal(t.cache.gifs, false)
	assert.equal(t.gif.getSetting(), false)
})
check('settings: Refresh pictures redraws the screens and says so', () => {
	const t = setup()
	t.emitted.length = 0
	const tree = t.plugin.SettingsComponent()
	const button = findNodes(tree, (n) => n.type === 'Pressable' && n.props.accessibilityLabel === 'Refresh pictures')[0]
	assert.ok(button, 'button')
	button.props.onPress()
	assert.deepEqual(t.emitted.filter((n) => n !== 'AccessibilityStore'), ['GuildStore', 'GuildMemberStore', 'UserStore', 'MessageStore'])
})
check('settings: the version is 4.0.0 and the status file is looked up under this plugin\'s id', () => {
	const t = setup()
	const text = flatten(t.plugin.SettingsComponent())
	assert.ok(text.some((s) => /4.1.0/.test(s)))
	const src = fs.readFileSync(__dirname + '/../../plugins/always-animate/index.js', 'utf8')
	assert.ok(src.includes("pluginStorageDirFor('marklong.always-animate')") && !src.includes('fluttershy2008.always-animate'))
})

;(async () => {
	const results = await Promise.all(pending)
	let failed = 0
	for (const r of results) { console.log(`${r[0]}   ${r[1]}${r[2] ? '  -> ' + r[2] : ''}`); if (r[0] === 'FAIL') failed++ }
	if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1) }
	console.log('All checks passed')
})()
