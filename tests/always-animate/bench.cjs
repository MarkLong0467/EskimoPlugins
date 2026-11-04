// Speed check. Usage: node tests/always-animate/bench.cjs plugins/always-animate/index.js (prints ns per React element and ms per 60-row chat update)
const fs = require('node:fs'), vm = require('node:vm')
const path = process.argv[2]
const subs = [], modules = [], cleanups = []
const add = (m) => { modules.push(m); subs.forEach((s) => { if (s.active && s.filter(m)) s.cb(m) }) }
const finders = {
	filters: { createFilterGenerator: (p) => (...a) => (m) => p(a, 0, m, true), withProps: (...k) => (m) => k.every((x) => x in m), withName: (n) => (m) => m.name === n },
	getModules(filter, cb) { const s = { filter, cb, active: true }; subs.push(s); modules.forEach((m) => { if (filter(m)) cb(m) }); return () => { s.active = false } },
}
const mk = (kind) => (t, k, cb) => { const old = t[k]; const w = kind === 'instead' ? function (...a) { return cb.call(this, a, old) } : kind === 'before' ? function (...a) { return old.apply(this, cb(a)) } : function (...a) { return cb(old.apply(this, a)) }; t[k] = w; return () => { t[k] = old } }
const patcher = { instead: mk('instead'), before: mk('before'), after: mk('after') }
const runtime = { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) }
const React = { createElement: (type, props) => ({ type, props }), useState() {} }
add(runtime); add(React)
const commands = { updateRows: (ref, data) => data, clearRows() {}, scrollToBottom() {} }
add(commands)
const script = fs.readFileSync(path, 'utf8')
const ctx = { valenced: { modules: { finders, native: { getNativeModule() { throw new Error('na') } } }, patcher, discord: { flux: { Stores: {} } }, plugins: { constants: { pluginStorageDirFor: () => '/x' } } } }
const factory = vm.runInNewContext('(function (valenced, plugin) { return ' + script + '\n})', {})
const plugin = factory(ctx.valenced, (o) => o).default
const storage = { cache: { images: true, emojis: true, stickers: true, cosmetics: true, gifs: true, motion: true }, set() {} }
const api = { jsonStorage: storage, cleanup: (...f) => cleanups.push(...f) }
plugin.init(api); plugin.start(api)

// 1. Element creation, like a busy screen: mostly host components and ordinary components, a few media components.
function Row() {}; function Text2() {}; function ListItem() {}; function ServerIcon() {}; function UserAvatar() {}
Row.displayName = 'Row'; Text2.displayName = 'Text'; ListItem.displayName = 'ListItem'
const types = ['View', 'Text', 'View', Row, Text2, 'Pressable', ListItem, 'View', Row, 'Image']
const N = 300000
const t0 = process.hrtime.bigint()
let sink = 0
for (let i = 0; i < N; i++) {
	const type = types[i % types.length]
	const props = { style: { flex: 1 }, testID: 'x' + (i & 7), onPress: null, children: null }
	if (type === 'Image') props.source = { uri: 'https://example.com/img.png' }
	sink += runtime.jsx(type, props).props.style.flex
}
const t1 = process.hrtime.bigint()
const el = Number(t1 - t0) / 1e6
console.log(`elements: ${N} created in ${el.toFixed(0)} ms (${(el * 1e6 / N).toFixed(0)} ns each)`)

// 2. Chat updates: 60 rows with realistic messages.
function message(i) {
	const m = { id: 'm' + i, channelId: 'c', type: 0, flags: 0, avatarURL: `https://cdn.discordapp.com/avatars/${i}/a_${'f'.repeat(30)}${i % 10}.webp?size=80`, avatarDecorationURL: `https://cdn.discordapp.com/media/v1/collectibles-shop/${i}/static`, username: 'user' + i, authorId: String(i), isFirst: true, gifAutoPlay: true, animateEmoji: false, reactions: [], embeds: [], attachments: [] }
	for (let k = 0; k < 70; k++) m['field' + k] = k % 3 === 0 ? 'value' + k : k % 3 === 1 ? k : null
	m.content = Array.from({ length: 40 }, (_, j) => ({ type: 'text', content: 'hello world ' + j, nested: { a: [1, 2, 3] } }))
	m.reactions = Array.from({ length: 6 }, (_, j) => ({ emoji: { id: String(j), name: 'e' + j, animated: j % 2 === 0, src: 'https://cdn.discordapp.com/emojis/' + j + '.webp' }, count: j + 1, me: false }))
	m.components = Array.from({ length: 10 }, (_, j) => ({ type: 'row', children: Array.from({ length: 5 }, (_, q) => ({ type: 'button', label: 'b' + q, id: j + ':' + q })) }))
	m.referencedMessage = { message: { id: 'r' + i, avatarURL: `https://cdn.discordapp.com/avatars/${i}/a_${'e'.repeat(30)}.webp`, username: 'ref', content: [{ type: 'text', content: 'quoted' }] } }
	return m
}
const rows = Array.from({ length: 60 }, (_, i) => ({ type: 1, message: message(i), changeType: 1, index: i }))
const C = 120
const t2 = process.hrtime.bigint()
let out
for (let i = 0; i < C; i++) out = commands.updateRows('ref', { rows: rows.map((r) => ({ ...r })) })
const t3 = process.hrtime.bigint()
const ch = Number(t3 - t2) / 1e6
console.log(`chat updates: ${C} calls x 60 rows in ${ch.toFixed(0)} ms (${(ch / C).toFixed(2)} ms per call of 60 rows)`)
console.log('check: avatar rewritten ->', /\.gif/.test(JSON.stringify(out).slice(0, 4000)) ? 'gif' : 'unchanged')
