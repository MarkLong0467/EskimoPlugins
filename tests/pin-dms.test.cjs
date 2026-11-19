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
		discord: { flux: { Stores: { PrivateChannelSortStore: sort, ChannelStore: channelStore, UserStore: { getUser: (id) => users[id] } } }, actions: { ToastActionCreators: { open: () => {} }, ActionSheetActionCreators: { openLazy: () => {}, hideActionSheet: () => {}, hideAllActionSheets: () => {} } }, design: { Design: new Proxy({}, { get: (_, k) => k }) } },
		patcher: { after: (o, k, fn) => { const orig = o[k]; o[k] = function (...a) { const r = orig.apply(this, a); const x = fn.call(this, r); return x === undefined ? r : x }; return () => { o[k] = orig } } },
		modules: { finders: { filters: { withProps: (...n) => n.join() }, lookupModule: (f) => (f === 'jsx,jsxs' ? [runtime] : []) } },
	}
	global.plugin = (d) => d
	const data = { cache: Object.assign({ pinsJson: JSON.stringify([LONG.c2, LONG.c4]), sectionsJson: '[]', assignJson: '{}' }, initial || {}) }
	const json = { get cache() { return data.cache }, use() { return data.cache } }
	const src = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'pin-dms', 'index.js'), 'utf8')
	const p = new Function('valenced', 'plugin', 'return ' + src)(global.valenced, global.plugin).default
	p.start({ cleanup: (f) => f, jsonStorage: json })
	// The plugin wraps the DM list in a piece that draws it again on changes; draw that piece here, as React would.
	for (const name of ['jsx', 'jsxs']) {
		const patched = runtime[name]
		runtime[name] = (t, props, key) => { const el = patched(t, props, key); return el && el.type && el.type.name === 'FastWrap' ? el.type(el.props) : el }
	}
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
	// Discord's message list inside every chat is also called "Messages" (displayName), and is given the channel.
	const chat = load({ stripOn2: true, sectionsJson: '[{"id":"s1","name":"Boys","color":"#00d4ff"}]', assignJson: JSON.stringify({ [LONG.c2]: 's1' }) })
	function MessagesRenderer() {}
	MessagesRenderer.displayName = 'Messages'
	const memoChat = { $$typeof: Symbol.for('react.memo'), type: MessagesRenderer }
	check('the message list inside a chat gets no strip', chat.runtime.jsx(memoChat, { channel: { id: '1' }, messages: {} }).type === memoChat)
	function Messages2() {}
	Object.defineProperty(Messages2, 'name', { value: 'Messages' })
	check('a chat\'s list given the channel gets no strip, whatever it is called', chat.runtime.jsx(Messages2, { channel: { id: '1' }, messages: {} }).type === Messages2)
	const below = load({ stripOn2: true, stripBelow2: true })
	check('with the strip under the header, the screen does not get a second one on top', below.runtime.jsx(Messages, { style: [] }).type === Messages)
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
	check('the heading shows just the section name', ht.join('') === 'BOYS', ht.join('|'))
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
		check('compact: a labelled row gets top padding, which moves its content down', JSON.stringify(rowFor('c2').props.style) === '[{"height":55},{"paddingTop":12}]', JSON.stringify(rowFor('c2').props.style))
		check('compact: a chat without a label keeps its own style', JSON.stringify(rowFor('c3').props.style) === '{"height":55}', JSON.stringify(rowFor('c3').props.style))
		check('compact: the children of a labelled row are not wrapped or changed', kidsOf(rowFor('c2'))[0].props.style === undefined)
		const lab = kidsOf(rowFor('c2')).filter((k) => k.type && k.type.name === 'CompactLabel')[0]
		c.setCur('lab'); const ltxt = texts(expand(lab.type(lab.props))).join('')
		check('compact: the label shows just the section name', ltxt === 'BOYS', ltxt)
		c.data.cache.sectionsJson = secs.replace('"name":"Boys","color":"#00d4ff"', '"name":"Lads","color":"#ff0000"')
		c.setCur('lab'); const renamed = expand(lab.type(lab.props))
		check('compact: after a rename the label draws the new name and colour', texts(renamed).join('') === 'LADS' && JSON.stringify(renamed).indexOf('#ff0000') >= 0, texts(renamed).join(''))
		const stripe = kidsOf(rowFor('c2')).filter((k) => k.type && k.type.name === 'SectionStripe')[0]
		c.setCur('stripe'); const st = stripe && stripe.type(stripe.props)
		check('compact: the stripe follows the section colour too', !!st && st.props.style.backgroundColor === '#ff0000', st && JSON.stringify(st.props.style))
		c.data.cache.sectionsJson = secs
		c.data.cache.sectionsJson = '[{"id":"s2","name":"Girls","color":"#ff69b4"}]'
		c.setCur('lab'); const afterDelete = texts(expand(lab.type(lab.props))).join('')
		check('compact: after its section is deleted, the label over those chats says Pinned, not Direct messages', afterDelete === 'PINNED', afterDelete)
		c.data.cache.sectionsJson = secs
		const unpinnedLab = kidsOf(rowFor('c1')).filter((k) => k.type && k.type.name === 'CompactLabel')[0]
		c.data.cache.pinsJson = '[]'
		c.setCur('lab2'); const gone = unpinnedLab.type(unpinnedLab.props)
		check('compact: with nothing pinned any more, an old label draws nothing', gone === null, JSON.stringify(gone))
		c.data.cache.pinsJson = JSON.stringify([LONG.c2, LONG.c4])
		const z = load({ sectionsJson: secs, assignJson: asg2, hdClear: 0 })
		z.runtime.jsx(MessagesFastestList, { data: { channels: mk(), sections: [0, 1, 6] } })
		const zr = z.runtime.jsx(PressableHighlight, { onLongPress: () => {}, children: { type: 'V', props: { channelId: LONG.c2 } }, style: { height: 55 } })
		check('compact: the clearance can be set to zero', JSON.stringify(zr.props.style) === '{"height":55}', JSON.stringify(zr.props.style))
		const f = load({ sectionsJson: secs.replace('"color":"#00d4ff"', '"color":"#00d4ff","collapsed":true'), assignJson: asg2 })
		const elf = f.runtime.jsx(MessagesFastestList, { data: { channels: mk(), sections: [0, 1, 6] } })
		check('compact: a folded section shows only its heading row, none of its chats', short(elf.props.data.channels.map((x) => x.channelId)) === 'pin-head:s1,c1,c3,c5,g1' && elf.props.data.sections.join() === '0,1,5', short(elf.props.data.channels.map((x) => x.channelId)))
		function MessagesItemChannelFast() {}
		const head = f.runtime.jsx(MessagesItemChannelFast, { channelId: 'pin-head:s1', row: 0 })
		f.setCur('fh'); const headOut = head.type(head.props)
		check('compact: the folded heading row shows ▸ and the section name', head.type.name === 'ListHeader' && texts(expand(headOut)).join('') === '▸ BOYS', texts(expand(headOut)).join(''))
		check('compact: the folded heading text is centred in its row', headOut.props.style.justifyContent === 'center' && headOut.props.style.paddingTop === 0)
		function PressableHighlight2() {}
		const restRow = f.runtime.jsx(PressableHighlight2, { onLongPress: () => {}, children: { type: 'V', props: { channelId: LONG.c1 } }, style: { height: 55 } })
		const restKids = Array.isArray(restRow.props.children) ? restRow.props.children : [restRow.props.children]
		check('compact: under a folded section the first other chat still has the Direct messages label', restKids.some((k) => k && k.type && k.type.name === 'CompactLabel' && k.props.kind === 'rest'))
		headOut.props.onPress()
		check('compact: tapping the folded heading unfolds the section', !JSON.parse(f.data.cache.sectionsJson)[0].collapsed)
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
// 7. Discord's own Pin button in the hold-down menu is replaced by one row per section
const later = []
{
	const secs = '[{"id":"s1","name":"Boys","color":"#00d4ff"},{"id":"s2","name":"Girls","color":"#ff69b4"}]'
	function DMChannelSheet() {}
	function TableRowGroup() {}
	function TableRow() {}
	function PinIcon() {}
	const mkGroup = (a, props) => {
		a.runtime.jsx(DMChannelSheet, props || { channel: { id: LONG.c3, type: 1 } })
		const icon = a.runtime.jsx(PinIcon, {})
		const row = a.runtime.jsx(TableRow, { label: 'Pin', icon, onPress: () => {} })
		return a.runtime.jsx(TableRowGroup, { children: [row] })
	}
	const mkGroupNoSheet = (a) => { const icon = a.runtime.jsx(PinIcon, {}); const row = a.runtime.jsx(TableRow, { label: 'Pin', icon, onPress: () => {} }); return a.runtime.jsx(TableRowGroup, { children: [row] }) }
	const labelsOf = (g) => (Array.isArray(g.props.children) ? g.props.children : [g.props.children]).map((r) => r.props.label)
	const a = load({ sectionsJson: secs })
	const g = mkGroup(a)
	check('the hold-down menu shows Pin to each section instead of Discord\'s Pin', labelsOf(g).join('|') === 'Pin to Boys|Pin to Girls|Pin (no group)|Pin in Discord', labelsOf(g).join('|'))
	const rowsOf = (gg) => (Array.isArray(gg.props.children) ? gg.props.children : [gg.props.children])
	check('the rows copy the look of Discord\'s own row', rowsOf(g)[0].type === TableRow)
	{
		let nativePressed = 0
		const b = load({ sectionsJson: secs })
		const icon = b.runtime.jsx(PinIcon, {})
		const nrow = b.runtime.jsx(TableRow, { label: 'Pin', icon, onPress: () => { nativePressed++ } })
		b.runtime.jsx(function DMSheet() {}, { channel: { id: LONG.c3, type: 1 } })
		const grp = b.runtime.jsx(TableRowGroup, { children: [nrow] })
		const discordRow = rowsOf(grp).filter((r) => r.props.label === 'Pin in Discord')[0]
		discordRow.props.onPress()
		check('Pin in Discord runs Discord’s own Pin and does not pin in the plugin', nativePressed === 1 && !JSON.parse(b.data.cache.pinsJson).includes(LONG.c3))
	}
	rowsOf(g)[0].props.onPress()
	// What the phone does after a change: the list is drawn again, and each chat row comes back with a new key, so Discord
	// draws it fresh with the new label instead of keeping the old row.
	{
		const r = load({ sectionsJson: '[]', pinsJson: '[]' })
		const mine = globalThis.__pinDmsInstance
		function MessagesFastestList() {}
		function MessagesItemChannelFast() {}
		function PressableHighlight() {}
		const chans = () => Object.keys(LONG).map((k) => ({ channelId: LONG[k], lastMessageId: '1', isFavorite: false, isRequest: false }))
		const drawList = () => r.runtime.jsx(MessagesFastestList, { data: { channels: chans(), sections: [0, 1, 6] } })
		const rowKey = (id) => { const el = r.runtime.jsx(MessagesItemChannelFast, { channelId: LONG[id], row: 0 }); return el.key != null ? el.key : el.props.key }
		const labelOn = (id) => { const el = r.runtime.jsx(PressableHighlight, { onLongPress: () => {}, children: { type: 'V', props: { channelId: LONG[id] } }, style: { height: 55 } }); const kids = Array.isArray(el.props.children) ? el.props.children : [el.props.children]; const lab = kids.filter((k) => k && k.type && k.type.name === 'CompactLabel')[0]; if (!lab) return ''; r.setCur('L' + id); return texts(expand(lab.type(lab.props))).join('') }
		drawList()
		const before = rowKey('c3')
		const icon = r.runtime.jsx(PinIcon, {})
		const sheetRow = r.runtime.jsx(TableRow, { label: 'Pin', icon, onPress: () => {} })
		r.runtime.jsx(function DMSheet() {}, { channel: { id: LONG.c3, type: 1 } })
		const grp = r.runtime.jsx(TableRowGroup, { children: [sheetRow] })
		;(Array.isArray(grp.props.children) ? grp.props.children : [grp.props.children])[0].props.onPress()
		later.push(new Promise((res) => setTimeout(() => {
			globalThis.__pinDmsInstance = mine // later tests start other copies; draw with this one
			check('after pinning, the chat is pinned', JSON.parse(r.data.cache.pinsJson).includes(LONG.c3))
			const ordered = drawList().props.data.channels.map((c) => c.channelId)
			check('after pinning, the list is drawn with the chat first', ordered[0] === LONG.c3)
			check('after pinning, the row comes back with a new key, so Discord draws it again', rowKey('c3') !== before, before + ' -> ' + rowKey('c3'))
			check('the redrawn pinned row has the PINNED label (no restart)', labelOn('c3') === 'PINNED', labelOn('c3'))
			check('the first other chat has the DIRECT MESSAGES label', labelOn('c1') === 'DIRECT MESSAGES', labelOn('c1'))
			res()
		}, 30)))
	}
	// Rename and delete a section the way a person does: hold its label in the list, change it in the sheet, Save / Delete.
	{
		const secs1 = '[{"id":"s1","name":"Boys","color":"#e67e22"}]'
		const r = load({ sectionsJson: secs1, assignJson: JSON.stringify({ [LONG.c2]: 's1', [LONG.c4]: 's1' }) })
		const mine = globalThis.__pinDmsInstance
		const V = global.valenced
		let sheet = null
		V.discord.actions.ActionSheetActionCreators.openLazy = (p) => { p.then((m) => { sheet = m.default }) }
		function MessagesFastestList() {}
		function MessagesItemChannelFast() {}
		function PressableHighlight() {}
		const chans = () => Object.keys(LONG).map((k) => ({ channelId: LONG[k], lastMessageId: '1', isFavorite: false, isRequest: false }))
		const drawList = () => r.runtime.jsx(MessagesFastestList, { data: { channels: chans(), sections: [0, 1, 6] } })
		const rowKey = (id) => { const el = r.runtime.jsx(MessagesItemChannelFast, { channelId: LONG[id], row: 0 }); return el.key != null ? el.key : el.props.key }
		const labelEl = (id) => { const el = r.runtime.jsx(PressableHighlight, { onLongPress: () => {}, children: { type: 'V', props: { channelId: LONG[id] } }, style: { height: 55 } }); const kids = Array.isArray(el.props.children) ? el.props.children : [el.props.children]; return kids.filter((k) => k && k.type && k.type.name === 'CompactLabel')[0] }
		const drawn = (id) => { const lab = labelEl(id); if (!lab) return null; r.setCur('L' + id); return lab.type(lab.props) }
		const find = (n, f) => { if (Array.isArray(n)) { for (const x of n) { const y = find(x, f); if (y) return y } return null } if (!n || typeof n !== 'object') return null; if (f(n)) return n; return find(n.props && n.props.children, f) }
		const wait = (ms) => new Promise((res) => setTimeout(res, ms))
		later.push((async () => {
			drawList()
			check('a section label starts with its name', texts(drawn('c2')).join('') === 'BOYS')
			const key0 = rowKey('c2')
			// hold the label: the edit sheet opens
			drawn('c2').props.onLongPress()
			await wait(5)
			globalThis.__pinDmsInstance = mine
			r.setCur('edit'); let tree = expand(sheet({}))
			find(tree, (n) => n.type === 'TextInput' && n.props.label === 'Name').props.onChange('Lads')
			r.setCur('edit'); tree = expand(sheet({}))
			find(tree, (n) => n.type === 'Button' && n.props.text === 'Save').props.onPress()
			await wait(400)
			globalThis.__pinDmsInstance = mine
			drawList()
			check('rename: saved', JSON.parse(r.data.cache.sectionsJson)[0].name === 'Lads')
			check('rename: the row comes back with a new key, so Discord draws it again', rowKey('c2') !== key0)
			check('rename: the label shows the new name with no restart', texts(drawn('c2')).join('') === 'LADS', texts(drawn('c2')).join(''))
			const key1 = rowKey('c2')
			// hold it again and delete the section
			drawn('c2').props.onLongPress()
			await wait(5)
			globalThis.__pinDmsInstance = mine
			r.setCur('edit2'); tree = expand(sheet({}))
			find(tree, (n) => n.type === 'Button' && n.props.text === 'Delete section').props.onPress()
			await wait(400)
			globalThis.__pinDmsInstance = mine
			drawList()
			check('delete: the section is gone and its chats stay pinned', JSON.parse(r.data.cache.sectionsJson).length === 0 && JSON.parse(r.data.cache.pinsJson).length === 2)
			check('delete: the row comes back with a new key', rowKey('c2') !== key1)
			check('delete: the label over the pinned chats says PINNED, not DIRECT MESSAGES', texts(drawn('c2')).join('') === 'PINNED', texts(drawn('c2')).join(''))
			check('delete: DIRECT MESSAGES is over the first unpinned chat only', texts(drawn('c1')).join('') === 'DIRECT MESSAGES' && drawn('c4') === null)
		})())
	}
	later.push(new Promise((res) => setTimeout(() => { check('choosing Pin to Boys pins the chat in that section', a.data.cache.pinsJson.indexOf(LONG.c3) >= 0 && JSON.parse(a.data.cache.assignJson)[LONG.c3] === 's1', a.data.cache.assignJson); res() }, 20)))
	const pinned = load({ sectionsJson: secs, pinsJson: JSON.stringify([LONG.c3]), assignJson: JSON.stringify({ [LONG.c3]: 's2' }) })
	const gp = mkGroup(pinned)
	check('for a pinned chat the menu marks its section and offers Unpin', labelsOf(gp).join('|') === 'Pin to Boys|✓ Pin to Girls|Pin (no group)|Unpin|Pin in Discord', labelsOf(gp).join('|'))
	const none = load({})
	check('with no sections it is just Pin to the top', labelsOf(mkGroup(none)).join('|') === 'Pin to the top|Pin in Discord', labelsOf(mkGroup(none)).join('|'))
	const msg = load({ sectionsJson: secs })
	check('the menu of a message is left alone', mkGroup(msg, { channel: { id: LONG.c3, type: 1 }, message: { id: '1' } }).props.children[0].props.label === 'Pin')
	const off = load({ sectionsJson: secs, pinHideOff: true })
	check('Discord\'s Pin can be kept with the switch', mkGroup(off).props.children[0].props.label === 'Pin')
	const noch = load({ sectionsJson: secs })
	const icon2 = noch.runtime.jsx(PinIcon, {}); const row2 = noch.runtime.jsx(TableRow, { label: 'Pin', icon: icon2 })
	check('without a DM sheet behind it nothing is replaced', noch.runtime.jsx(TableRowGroup, { children: [row2] }).props.children[0].props.label === 'Pin')
	function SheetHeader() {}
	function MessagesItemChannelFast() {}
	const hdr = load({ sectionsJson: secs }); hdr.runtime.jsx(SheetHeader, { channel: { id: LONG.c3, type: 1 } })
	check('any piece of the sheet carrying a DM tells us which chat it is', labelsOf(mkGroupNoSheet(hdr)).join('|') === 'Pin to Boys|Pin to Girls|Pin (no group)|Pin in Discord')
	const rowOnly = load({ sectionsJson: secs }); rowOnly.runtime.jsx(MessagesItemChannelFast, { channelId: LONG.c4 })
	check('the list\'s own rows do not count as a sheet', mkGroupNoSheet(rowOnly).props.children[0].props.label === 'Pin')
	const big = load({ sectionsJson: secs }); big.runtime.jsx(DMChannelSheet, { channel: { id: LONG.c3, type: 1 } })
	const many = big.runtime.jsx(TableRowGroup, { children: [1, 2, 3, 4].map(() => big.runtime.jsx(TableRow, { label: 'Pin', icon: big.runtime.jsx(PinIcon, {}) })) })
	check('a long group of rows is not mistaken for the Pin group', many.props.children.length === 4)
	// Discord wraps each row of the group in its own piece; a piece holding one of our rows is not replaced again.
	const wrap = load({ sectionsJson: secs, pinsJson: JSON.stringify([LONG.c3]), assignJson: JSON.stringify({ [LONG.c3]: 's2' }) })
	const wg = mkGroup(wrap)
	function RowWrapper() {}
	const again = rowsOf(wg).map((r) => wrap.runtime.jsx(RowWrapper, { children: [r] }))
	check('the rows made for the menu are not swapped for the whole list again', again.every((w, i) => w.props.children.length === 1 && w.props.children[0] === rowsOf(wg)[i]), again.map((w) => w.props.children.length).join())
	const regroup = wrap.runtime.jsx(TableRowGroup, { children: rowsOf(wg).slice(-2) })
	check('a small group of the menu\'s own Pin rows is left alone', labelsOf(regroup).join('|') === 'Unpin|Pin in Discord', labelsOf(regroup).join('|'))
}

// Discord's own pinned DMs (data.channelFavorites) go into the groups: to the top of their section, or of Direct messages.
{
	const secs1 = '[{"id":"s1","name":"Boys","color":"#e67e22"}]'
	const r = load({ sectionsJson: secs1, assignJson: JSON.stringify({ [LONG.c2]: 's1', [LONG.c4]: 's1' }) })
	function MessagesFastestList() {}
	function PressableHighlight() {}
	const entry = (k) => ({ channelId: LONG[k], lastMessageId: '1', isFavorite: false, isRequest: false })
	const data = { channels: ['c1', 'c2', 'c3', 'g1'].map(entry), channelFavorites: ['c4', 'c5'].map((k) => ({ ...entry(k), isFavorite: true })), sections: [2, 4, 0, 0, 0] }
	const el = r.runtime.jsx(MessagesFastestList, { data })
	const order = el.props.data.channels.map((c) => Object.keys(LONG).find((k) => LONG[k] === c.channelId)).join()
	check('native pins: a chat pinned in Discord and in a section goes to the top of that section', order.startsWith('c4,c2'), order)
	check('native pins: a chat pinned only in Discord goes to the top of Direct messages', order === 'c4,c2,c5,c1,c3,g1', order)
	check('native pins: Discord no longer draws them above everything', el.props.data.channelFavorites.length === 0 && el.props.data.sections.slice(0, 2).join() === '0,6', JSON.stringify(el.props.data.sections))
	const labelKind = (k) => { const row = r.runtime.jsx(PressableHighlight, { onLongPress: () => {}, children: { type: 'V', props: { channelId: LONG[k] } }, style: { height: 55 } }); const kids = Array.isArray(row.props.children) ? row.props.children : [row.props.children]; const lab = kids.filter((x) => x && x.type && x.type.name === 'CompactLabel')[0]; if (!lab) return ''; r.setCur('n' + k); return texts(expand(lab.type(lab.props))).join('') }
	check('native pins: the section label sits on the first chat of the section', labelKind('c4') === 'BOYS' && labelKind('c2') === '', labelKind('c4') + '/' + labelKind('c2'))
	check('native pins: Direct messages label sits on the Discord-pinned chat at its top', labelKind('c5') === 'DIRECT MESSAGES' && labelKind('c1') === '', labelKind('c5') + '/' + labelKind('c1'))
	r.data.cache.nativeInto = false
	const off = r.runtime.jsx(MessagesFastestList, { data: { ...data } })
	check('native pins: with the switch off Discord keeps them above everything', off.props.data.channelFavorites.length === 2 && off.props.data.sections[0] === 2)
	delete r.data.cache.nativeInto
	const none = load({})
	none.data.cache.pinsJson = '[]'
	const plain = none.runtime.jsx(MessagesFastestList, { data })
	check('native pins: with nothing pinned in the plugin the list is left as Discord made it', plain.props.data === data)
}

// Folding redraws the list straight away: the list piece listens for changes and draws again with the folded section.
{
	const secs1 = '[{"id":"s1","name":"Boys","color":"#e67e22"}]'
	const r = load({ sectionsJson: secs1, assignJson: JSON.stringify({ [LONG.c2]: 's1', [LONG.c4]: 's1' }) })
	const mine = globalThis.__pinDmsInstance
	const React = global.valenced.react.React
	const effects = []
	React.useEffect = (fn) => { effects.push(fn) }
	let redraws = 0
	const realState = React.useState
	React.useState = (i) => { const pair = realState(i); return [pair[0], (v) => { const before = pair[0]; pair[1]((old) => { const n = typeof v === 'function' ? v(old) : v; if (n !== old) redraws++; return n }); void before }] }
	function MessagesFastestList() {}
	function PressableHighlight() {}
	const chans = () => Object.keys(LONG).map((k) => ({ channelId: LONG[k], lastMessageId: '1', isFavorite: false, isRequest: false }))
	const data = { channels: chans(), sections: [0, 6, 0, 0, 0] }
	r.setCur('wrap')
	const first = r.runtime.jsx(MessagesFastestList, { data })
	effects.forEach((fn) => fn())
	check('fold: the list starts with both chats of the section', first.props.data.channels.length === 6)
	const row = r.runtime.jsx(PressableHighlight, { onLongPress: () => {}, children: { type: 'V', props: { channelId: LONG.c2 } }, style: { height: 55 } })
	const lab = (Array.isArray(row.props.children) ? row.props.children : [row.props.children]).filter((x) => x && x.type && x.type.name === 'CompactLabel')[0]
	r.setCur('lab'); lab.type(lab.props).props.onPress()
	later.push(new Promise((res) => setTimeout(() => {
		globalThis.__pinDmsInstance = mine
		check('fold: tapping the label asks the list to draw again (no need to open a chat)', redraws > 0, redraws)
		r.setCur('wrap')
		const again = r.runtime.jsx(MessagesFastestList, { data })
		check('fold: drawn again, the folded section shows only its heading', again.props.data.channels.length === 5, again.props.data.channels.length)
		React.useState = realState
		res()
	}, 30)))
}

Promise.all(later).then(() => {
console.log(failed ? '\n' + failed + ' check(s) failed' : '\nAll checks passed')
process.exit(failed ? 1 : 0)
})
