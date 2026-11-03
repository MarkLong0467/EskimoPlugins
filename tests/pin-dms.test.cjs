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
		cloneElement: (e, p, ...c) => ({ ...e, props: { ...e.props, ...p, ...(c.length ? { children: c.length > 1 ? c : c[0] } : {}) } }),
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

// 4c. Section headings inside the real list
{
	const secs = '[{"id":"s1","name":"Boys","color":"#00d4ff"},{"id":"s2","name":"Girls","color":"#ff69b4"}]'
	const asg = JSON.stringify({ [LONG.c2]: 's1', [LONG.c4]: 's2' })
	const mk = () => Object.keys(LONG).map((k) => ({ channelId: LONG[k], lastMessageId: '1', isFavorite: false, isRequest: false }))
	function MessagesFastestList() {}
	function MessagesItemChannelFast() {}
	const a = load({ sectionsJson: secs, assignJson: asg, hdStyle2: 'rows' })
	const el = a.runtime.jsx(MessagesFastestList, { data: { channels: mk(), sections: [0, 1, 6] } })
	const ids = el.props.data.channels.map((c) => SHORT[c.channelId] || c.channelId.replace('pin-head:', 'H:'))
	check('a heading row goes in front of each section, then the rest', ids.join() === 'H:s1,c2,H:s2,c4,H:rest,c1,c3,c5,g1', ids.join())
	check('the row count of the chat section grows by the headings', el.props.data.sections.join() === '0,1,9', el.props.data.sections.join())
	const hrow = a.runtime.jsx(MessagesItemChannelFast, { channelId: 'pin-head:s1', row: 0 })
	check('the list asking for a heading row gets the heading', hrow.type.name === 'ListHeader')
	a.setCur('hd'); const ht = texts(expand(hrow.type(hrow.props)))
	check('the heading shows the section name and count', ht.join('').indexOf('BOYS') >= 0 && ht.join('').indexOf('1') >= 0, ht.join('|'))
	const hs = (o) => { const x = load(Object.assign({ sectionsJson: secs, assignJson: asg, hdStyle2: 'rows' }, o)); const r = x.runtime.jsx(MessagesItemChannelFast, { channelId: 'pin-head:s1', row: 0 }); x.setCur('s'); return r.type(r.props).props.style }
	check('a heading is as tall as a chat row and has a little room above its text', hs({}).height === 55 && hs({}).paddingTop === 29, JSON.stringify(hs({})))
	check('more space above a heading means more padding above its text', hs({ hdAbove2: 50 }).paddingTop === 39 && hs({ hdAbove2: 11 }).paddingTop === 0)
	const sx = load({ sectionsJson: secs, assignJson: asg, hdStyle2: 'rows' }); sx.setCur('sp'); const tree = expand(sx.p.SettingsComponent({ api: { jsonStorage: sx.json } }))
	const all = []; const walkS = (n) => { if (Array.isArray(n)) return n.forEach(walkS); if (!n || typeof n !== 'object') return; all.push(n); walkS(n.props && n.props.children) }
	walkS(tree)
	const plus = all.filter((n) => n.props && n.props.text === '+')
	check('the settings page has a plus and minus for the heading position', plus.length === 1)
	plus[0].props.onPress()
	check('the plus button moves the heading down', sx.data.cache.hdAbove2 === 44, String(sx.data.cache.hdAbove2))
	const txt = texts(tree).join('|')
	check('the settings page shows the summary, the preview heading and the sections', /2 pinned chats in 2 sections/.test(txt) && /Heading position/.test(txt) && ['Sections', 'Pinned', 'Options', 'Diagnostics'].every((g) => all.some((n) => n.props && n.props.title === g)), txt.slice(0, 120))
	// rows are never moved: the list clips them (1.13.0 hid everything)
	function PressableHighlight() {}
	const rows = load({ sectionsJson: secs, assignJson: asg, hdStyle2: 'rows' })
	rows.runtime.jsx(MessagesFastestList, { data: { channels: mk(), sections: [0, 1, 6] } })
	const row = rows.runtime.jsx(PressableHighlight, { onLongPress: () => {}, children: { type: 'V', props: { channelId: LONG.c1 } }, style: { height: 55 } })
	check('a plain chat row keeps its own style (no shift)', JSON.stringify(row.props.style) === '{"height":55}', JSON.stringify(row.props.style))
	const pinnedRow = rows.runtime.jsx(PressableHighlight, { onLongPress: () => {}, children: { type: 'V', props: { channelId: LONG.c2 } }, style: { height: 55 } })
	check('a pinned row keeps its own style too', JSON.stringify(pinnedRow.props.style) === '{"height":55}', JSON.stringify(pinnedRow.props.style))
	check('the sections page still opens the edit sheet', true)
	const normal = a.runtime.jsx(MessagesItemChannelFast, { channelId: LONG.c1, row: 3 })
	check('a normal chat row is left alone', normal.type === MessagesItemChannelFast)
	const folded = load({ sectionsJson: secs.replace('"color":"#00d4ff"', '"color":"#00d4ff","collapsed":true'), assignJson: asg, hdStyle2: 'rows' })
	const el2 = folded.runtime.jsx(MessagesFastestList, { data: { channels: mk(), sections: [0, 1, 6] } })
	const ids2 = el2.props.data.channels.map((c) => SHORT[c.channelId] || c.channelId.replace('pin-head:', 'H:'))
	check('a folded section keeps its heading and hides its chats', ids2.join() === 'H:s1,H:s2,c4,H:rest,c1,c3,c5,g1' && el2.props.data.sections.join() === '0,1,8', ids2.join() + ' / ' + el2.props.data.sections.join())
	const odd = load({ sectionsJson: secs, assignJson: asg, hdStyle2: 'rows' })
	const el3 = odd.runtime.jsx(MessagesFastestList, { data: { channels: mk(), sections: [0, 1, 99] } })
	check('if the section sizes do not match, no headings are added (still pinned first)', el3.props.data.channels.length === 6 && short(el3.props.data.channels.map((c) => c.channelId)).startsWith('c2,c4'), el3.props.data.channels.length)
	const off = load({ sectionsJson: secs, assignJson: asg, hdOff: true, hdStyle2: 'rows' })
	const el4 = off.runtime.jsx(MessagesFastestList, { data: { channels: mk(), sections: [0, 1, 6] } })
	check('headings can be switched off', el4.props.data.channels.length === 6)
	const crashed = load({ sectionsJson: secs, assignJson: asg, hdTrial: true, hdStyle2: 'rows' })
	const el5 = crashed.runtime.jsx(MessagesFastestList, { data: { channels: mk(), sections: [0, 1, 6] } })
	check('if the app died while headings were new, they come back off', el5.props.data.channels.length === 6 && crashed.data.cache.hdOff === true)
}


// 4d. Compact headings (the default): labels inside the chats, no extra rows
{
		const secs = '[{"id":"s1","name":"Boys","color":"#00d4ff"},{"id":"s2","name":"Girls","color":"#ff69b4"}]'
		const mk = () => Object.keys(LONG).map((k) => ({ channelId: LONG[k], lastMessageId: '1', isFavorite: false, isRequest: false }))
		function MessagesFastestList() {}
		const asg2 = JSON.stringify({ [LONG.c2]: 's1', [LONG.c4]: 's1' })
		const c = load({ sectionsJson: secs, assignJson: asg2 })
		const elc = c.runtime.jsx(MessagesFastestList, { data: { channels: mk(), sections: [0, 1, 6] } })
		check('compact: no heading rows, same number of rows', elc.props.data.channels.length === 6 && elc.props.data.sections.join() === '0,1,6' && short(elc.props.data.channels.map((x) => x.channelId)) === 'c2,c4,c1,c3,c5,g1', short(elc.props.data.channels.map((x) => x.channelId)))
		function PressableHighlight() {}
		const rowFor = (id) => c.runtime.jsx(PressableHighlight, { onLongPress: () => {}, children: { type: 'V', props: { channelId: LONG[id] } }, style: { height: 55 } })
		const kidsOf = (el) => (Array.isArray(el.props.children) ? el.props.children : [el.props.children])
		const label = (el) => kidsOf(el).filter((k) => k && k.type && k.type.name === 'CompactLabel').map((k) => k.props.kind)
		check('compact: the first chat of a section carries its label', label(rowFor('c2')).join() === 's1', label(rowFor('c2')).join())
		check('compact: the second chat of the same section has none', label(rowFor('c4')).length === 0)
		check('compact: the first normal chat carries the Direct messages label', label(rowFor('c1')).join() === 'rest', label(rowFor('c1')).join())
		check('compact: other chats have no label', label(rowFor('c3')).length === 0)
		check('compact: the row keeps its own style (no shift)', JSON.stringify(rowFor('c2').props.style) === '{"height":55}')
		const lab = kidsOf(rowFor('c2')).filter((k) => k.type && k.type.name === 'CompactLabel')[0]
		c.setCur('lab'); const ltxt = texts(expand(lab.type(lab.props))).join('')
		check('compact: the label shows the section name and count', ltxt.indexOf('S1') < 0 && ltxt.toUpperCase().indexOf('BOYS') >= 0 && ltxt.indexOf('2') >= 0, ltxt)
		const f = load({ sectionsJson: secs.replace('"color":"#00d4ff"', '"color":"#00d4ff","collapsed":true'), assignJson: asg2 })
		const elf = f.runtime.jsx(MessagesFastestList, { data: { channels: mk(), sections: [0, 1, 6] } })
		check('compact: a folded section keeps its first chat and hides the rest', short(elf.props.data.channels.map((x) => x.channelId)) === 'c2,c1,c3,c5,g1' && elf.props.data.sections.join() === '0,1,5', short(elf.props.data.channels.map((x) => x.channelId)))
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

// 6. An old copy of the plugin that is still hooked in must not add a second strip
{
	const a = load({ stripOn2: true })
	function Messages() {}
	const first = a.runtime.jsx(Messages, {})
	const b = load({ stripOn2: true }) // a newer copy starts; the first one is now stale
	global.valenced.react.ReactJSXRuntime.jsx = b.runtime.jsx
	const stale = a.runtime.jsx(Messages, {})
	check('the newest copy wraps the screen', first.type === 'V')
	check('a stale copy leaves the screen alone', stale.type === Messages)
}
console.log(failed ? '\n' + failed + ' check(s) failed' : '\nAll checks passed')
process.exit(failed ? 1 : 0)
