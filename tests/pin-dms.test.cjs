// Mock tests for Pin DMs. Run with: node tests/pin-dms.test.cjs
// They load index.js against a tiny fake Valenced and check the behaviour that can be checked without a phone.
const fs = require('fs')
const path = require('path')
let failed = 0
function check(name, ok, extra) {
	console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + extra))
	if (!ok) failed++
}

const LONG = { c1: '900000000000000001', c2: '900000000000000002', c3: '900000000000000003', c4: '900000000000000004', c5: '900000000000000005', g1: '900000000000000006' }
const SHORT = {}
Object.keys(LONG).forEach((k) => (SHORT[LONG[k]] = k))
const short = (list) => list.map((x) => SHORT[x] || x).join()
function load(initial) {
	const order = Object.keys(LONG).map((k) => LONG[k])
	const sort = { getPrivateChannelIds() { return order.slice() }, getSortedChannels() { return [] }, emitChange() {} }
	const chans = {}
	order.forEach((id) => (chans[id] = { id, type: id === LONG.g1 ? 3 : 1, recipients: ['u' + id], name: id === LONG.g1 ? 'Study group' : undefined }))
	const mutable = {}
	order.forEach((id) => (mutable[id] = chans[id]))
	const channelStore = { getChannel: (id) => chans[id], getMutablePrivateChannels() { return mutable }, getSortedPrivateChannels() { return order.map((id) => chans[id]) } }
	const users = {}
	const names = { c1: 'anna', c2: 'bob', c3: 'cara', c4: 'dan', c5: 'eve' }
	Object.keys(names).forEach((k) => (users['u' + LONG[k]] = { id: 'u' + LONG[k], username: names[k] }))
	const hooks = {}
	let cur = 'x'
	let hi = 0
	const React = {
		useState: (i) => { const h = (hooks[cur] = hooks[cur] || []); const k = hi++; if (!(k in h)) h[k] = i; return [h[k], (v) => { h[k] = typeof v === 'function' ? v(h[k]) : v }] },
		useRef: (i) => { const h = (hooks[cur] = hooks[cur] || []); const k = hi++; if (!(k in h)) h[k] = { current: i }; return h[k] },
		useEffect: () => {},
		createElement: (t, p, ...c) => ({ type: t, props: { ...p, children: c.length > 1 ? c : c[0] }, key: p && p.key }),
		cloneElement: (e, p) => ({ ...e, props: { ...e.props, ...p } }),
	}
	const runtime = { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }) }
	global.valenced = {
		react: { React, ReactNative: { View: 'V', ScrollView: 'S', Pressable: 'P', Image: 'I', Dimensions: { get: () => ({ height: 2000 }) }, Platform: { OS: 'android' }, StatusBar: { currentHeight: 30 }, Linking: { openURL: (u) => { global.opened = u } } }, ReactJSXRuntime: runtime },
		assets: { getAssetIdByName: () => undefined },
		externals: { ReactNativeClipboard: { Clipboard: { setString: (t) => { global.copied = t } } } },
		discord: { flux: { Stores: { PrivateChannelSortStore: sort, ChannelStore: channelStore, UserStore: { getUser: (id) => users[id] } } }, actions: { ToastActionCreators: { open: () => {} }, ActionSheetActionCreators: { openLazy: () => {}, hideActionSheet: () => {} } }, design: { Design: new Proxy({}, { get: (_, k) => k }) } },
		patcher: { after: (o, k, fn) => { const orig = o[k]; o[k] = function (...a) { const r = orig.apply(this, a); const x = fn.call(this, r); return x === undefined ? r : x }; return () => { o[k] = orig } } },
		modules: { finders: { filters: { withProps: (...n) => n.join() }, lookupModule: (f) => (f === 'jsx,jsxs' ? [runtime] : []) } },
	}
	global.plugin = (d) => d
	const data = { cache: Object.assign({ pinsJson: JSON.stringify([LONG.c2, LONG.c4]), sectionsJson: '[]', assignJson: '{}' }, initial || {}) }
	const json = { get cache() { return data.cache }, use() { return data.cache } }
	const src = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'pin-dms', 'index.js'), 'utf8')
	const p = new Function('valenced', 'plugin', 'return ' + src)(global.valenced, global.plugin).default
	p.start({ cleanup: (f) => f, jsonStorage: json })
	return { p, sort, channelStore, runtime, data, json, setCur: (c) => { cur = c; hi = 0 } }
}
const texts = (n, out = []) => { if (Array.isArray(n)) n.forEach((x) => texts(x, out)); else if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') texts(n.props && n.props.children, out); return out }
const expand = (n) => (Array.isArray(n) ? n.map(expand) : n && typeof n === 'object' && typeof n.type === 'function' ? expand(n.type(n.props)) : n && typeof n === 'object' ? { ...n, props: { ...n.props, children: expand(n.props && n.props.children) } } : n)

// 1. Order and hiding in the stores
{
	const a = load({ hidePinned2: false })
	check('pinned chats come first when hiding is off', short(a.sort.getPrivateChannelIds()) === 'c2,c4,c1,c3,c5,g1', short(a.sort.getPrivateChannelIds()))
	const o = Object.keys(a.channelStore.getMutablePrivateChannels())
	check('the object form of the list is reordered too', short(o) === 'c2,c4,c1,c3,c5,g1', short(o))
	const b = load({ hidePinned2: true })
	check('pinned chats are left out when hiding is on', short(b.sort.getPrivateChannelIds()) === 'c1,c3,c5,g1', short(b.sort.getPrivateChannelIds()))
	check('the object form leaves them out too', short(Object.keys(b.channelStore.getMutablePrivateChannels())) === 'c1,c3,c5,g1')
	const objs = a.channelStore.getSortedPrivateChannels()
	check('the list of channel objects never gets empty entries (the 1.3.1 crash)', objs.length === 6 && objs.every((c) => c && c.id), String(objs.length))
	check('asking twice gives the same list object', b.channelStore.getMutablePrivateChannels() === b.channelStore.getMutablePrivateChannels())
}

// 2. Sections order the pinned chats
{
	const a = load({ hidePinned2: false, sectionsJson: '[{"id":"s1","name":"Boys","color":"#00d4ff"},{"id":"s2","name":"Girls","color":"#ff69b4"}]', assignJson: JSON.stringify({ [LONG.c4]: 's1', [LONG.c2]: 's2' }) })
	check('a chat in the first section comes before one in the second', short(a.sort.getPrivateChannelIds().slice(0, 2)) === 'c4,c2', short(a.sort.getPrivateChannelIds()))
}

// 3. The strip
{
	const a = load({ stripOn2: true, sectionsJson: '[{"id":"s1","name":"Boys","color":"#00d4ff"}]', assignJson: JSON.stringify({ [LONG.c2]: 's1' }) })
	function Messages() {}
	const el = a.runtime.jsx(Messages, { x: 1 })
	check('the Messages screen is wrapped with the strip on top', el.type === 'V' && el.props.children[0].type.name === 'PinnedStrip' && el.props.children[1].type === Messages)
	check('the wrapped screen is flagged so it is not wrapped twice', el.props.children[1].props.__pinStrip === true)
	const strip = el.props.children[0]
	a.setCur('strip'); const out = expand(strip.type(strip.props))
	const t = texts(out)
	check('the strip lists pinned chats and the section', t.indexOf('bob') >= 0 && t.indexOf('dan') >= 0 && t.join('|').indexOf('BOYS') >= 0, t.join('|'))
	let row; const walk = (n) => { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; if (!row && n.type === 'P' && n.props.onLongPress && n.props.style && n.props.style.height === 46) row = n; walk(n.props && n.props.children) }
	walk(out); row.props.onPress()
	check('tapping a row opens the chat', /discord\.com\/channels\/@me\/9000/.test(global.opened || ''), global.opened)
	const off = load({ stripOn2: false }); const el2 = off.runtime.jsx(Messages, {})
	check('the strip can be turned off', el2.type === Messages)
}

// 4. Under the header, under the voice card, one strip only
{
	const a = load({ stripOn2: true, stripBelow2: true })
	function MessagesHeader() {}
	function ActiveVoiceCards() {}
	const h = a.runtime.jsx(MessagesHeader, {})
	check('the header gets the strip below it', h.type === 'V' && h.props.children[0].type === MessagesHeader && h.props.children[1].type.name === 'PinnedStrip')
	const v = a.runtime.jsx(ActiveVoiceCards, {})
	check('a voice card gets the strip below it', v.type === 'V' && v.props.children[0].type === ActiveVoiceCards)
	a.setCur('v'); const outV = expand(v.props.children[1].type(v.props.children[1].props))
	a.setCur('h'); const outH = v.props.children[1] && h.props.children[1].type(h.props.children[1].props)
	check('the voice slot shows, and the header slot steps aside', !!outV && outH === null)
}

// 4b. The real DM list hands over data.channels: pinned chats go first, nothing else changes
{
	const a = load({ hidePinned2: false })
	function MessagesFastestList() {}
	const channels = Object.keys(LONG).map((k) => ({ channelId: LONG[k], lastMessageId: '1', isFavorite: false, isRequest: false }))
	const data = { channels, channelFavorites: [], dataKey: null, sections: [0, 1, 6] }
	const el = a.runtime.jsx(MessagesFastestList, { data, listItemHeight: 55 })
	const got = el.props.data.channels.map((c) => c.channelId)
	check('pinned chats come first in data.channels', short(got) === 'c2,c4,c1,c3,c5,g1', short(got))
	check('the other fields of data are kept as they were', el.props.data.sections === data.sections && el.props.data.channelFavorites === data.channelFavorites && el.props.listItemHeight === 55)
	check('the list keeps the same number of rows', got.length === channels.length)
	const el2 = a.runtime.jsx(MessagesFastestList, { data })
	check('the same input gives the same data object (no needless re-layout)', el2.props.data === el.props.data)
	const none = load({ pinsJson: '[]' }); const el3 = none.runtime.jsx(MessagesFastestList, { data })
	check('with no pins the list is left alone', el3.props.data === data)
}

// 5. The list pieces and the report
{
	const a = load({ hidePinned2: true })
	function MessagesFastestList() {}
	const fl = a.runtime.jsx(MessagesFastestList, { rows: [{ channel: { id: LONG.c1 } }, { channel: { id: LONG.c2 } }, { channel: { id: LONG.c3 } }, { channel: { id: LONG.c4 } }] })
	check('pinned rows are taken out of the real list', short(fl.props.rows.map((r) => r.channel.id)) === 'c1,c3', short(fl.props.rows.map((r) => r.channel.id)))
	a.runtime.jsx(function Messages() {}, {}); a.runtime.jsx(function ActiveVoiceCards() {}, {})
	a.runtime.jsx(MessagesFastestList, { rows: [{ channel: { id: LONG.c1 } }], onEndReached: () => {} })
	const comp = a.p.SettingsComponent
	check('the settings page renders', typeof comp === 'function')
	a.setCur('settings'); const tree = expand(comp({ api: { jsonStorage: a.json } }))
	let copy; const walk = (n) => { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; if (n.props && n.props.label === 'Copy diagnostic report') copy = n; walk(n.props && n.props.children) }
	walk(tree)
	check('there is a button that copies a report', !!copy)
	copy.props.onPress()
	check('the report names the pieces and the list props', /Pin DMs report/.test(global.copied || '') && /MessagesFastestList/.test(global.copied) && /creation order/.test(global.copied), global.copied)
}

console.log(failed ? '\n' + failed + ' check(s) failed' : '\nAll checks passed')
process.exit(failed ? 1 : 0)
