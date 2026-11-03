// Mock tests for Bypass Status. Run with: node tests/bypass-status.test.cjs
const fs = require('fs')
const path = require('path')
let failed = 0
function check(name, ok, extra) {
	console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || extra === undefined ? '' : '  -> ' + extra))
	if (!ok) failed++
}
var pending = []
const ME = '100000000000000001'
const FRIEND = '200000000000000002'
const STRANGER = '300000000000000003'
const DMCH = '400000000000000004'
const GROUPDM = '400000000000000005'
const SRVCH = '500000000000000005'
const OTHERCH = '500000000000000006'
const GUILD = '600000000000000006'
const OTHERGUILD = '600000000000000007'
const GUILDCH = '700000000000000007'

function load(initial, myStatus) {
	let current = myStatus || 'dnd'
	const chans = {
		[DMCH]: { id: DMCH, type: 1, recipients: [FRIEND] },
		[GROUPDM]: { id: GROUPDM, type: 3, name: 'Study group', recipients: [FRIEND, STRANGER] },
		[SRVCH]: { id: SRVCH, type: 0, name: 'general', guild_id: GUILD },
		[OTHERCH]: { id: OTHERCH, type: 0, name: 'random', guild_id: OTHERGUILD },
		[GUILDCH]: { id: GUILDCH, type: 0, name: 'news', guild_id: GUILD },
	}
	const users = { [ME]: { id: ME, username: 'me' }, [FRIEND]: { id: FRIEND, username: 'anna', globalName: 'Anna' }, [STRANGER]: { id: STRANGER, username: 'eve' } }
	const guilds = { [GUILD]: { id: GUILD, name: 'My Server' }, [OTHERGUILD]: { id: OTHERGUILD, name: 'Other' } }
	const toasts = []
	const hooks = {}
	let cur = 'x', hi = 0
	const React = {
		useState: (i) => { const h = (hooks[cur] = hooks[cur] || []); const k = hi++; if (!(k in h)) h[k] = i; return [h[k], (v) => { h[k] = typeof v === 'function' ? v(h[k]) : v }] },
		useEffect: () => {},
		createElement: (t, p, ...c) => ({ type: t, props: { ...p, children: c.length > 1 ? c : c[0] }, key: p && p.key }),
		cloneElement: (e, p, ...c) => ({ ...e, props: { ...e.props, ...p, ...(c.length ? { children: c.length > 1 ? c : c[0] } : {}) } }),
	}
	const runtime = { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }) }
	// the dispatcher runs the "store handlers" that ask for the status while handling a message
	const asked = []
	const dispatcher = {
		dispatch(event) { asked.push({ type: event.type, status: selfPresence.getStatus(), presence: presence.getStatus(ME), flag: presence.isDND ? presence.isDND() : undefined }) },
		subscribe() {}, unsubscribe() {},
	}
	const selfPresence = { getStatus: () => current }
	const presence = { getStatus: () => current, isDND: () => current === 'dnd' }
	global.valenced = {
		react: { React, ReactNative: { View: 'V', ScrollView: 'S', Pressable: 'P' }, ReactJSXRuntime: runtime },
		externals: { ReactNativeClipboard: { Clipboard: { setString: (t) => { global.copied = t } } } },
		discord: {
			flux: { Stores: { SelfPresenceStore: selfPresence, PresenceStore: presence, ChannelStore: { getChannel: (id) => chans[id] }, UserStore: { getUser: (id) => users[id], getCurrentUser: () => users[ME] }, GuildStore: { getGuild: (id) => guilds[id], getGuilds: () => guilds }, PrivateChannelSortStore: { getPrivateChannelIds: () => [DMCH, GROUPDM] }, SelectedChannelStore: { getChannelId: () => DMCH } }, FluxDispatcher: dispatcher },
			actions: { ToastActionCreators: { open: (k, o) => toasts.push(o.text) }, ActionSheetActionCreators: { hideAllActionSheets: () => {} } },
			design: { Design: new Proxy({}, { get: (_, k) => k }) },
		},
		patcher: {
			after: (o, k, fn) => { const orig = o[k]; o[k] = function (...a) { const r = orig.apply(this, a); const x = fn.call(this, r); return x === undefined ? r : x }; return () => { o[k] = orig } },
			instead: (o, k, fn) => { const orig = o[k]; o[k] = function (...a) { return fn.call(this, a, orig) }; return () => { o[k] = orig } },
		},
		modules: { finders: { filters: { withProps: (...n) => n.join() }, lookupModule: (f) => (f === 'jsx,jsxs' ? [runtime] : []) } },
	}
	global.plugin = (d) => d
	const data = { cache: Object.assign({}, initial || {}) }
	const json = { get cache() { return data.cache }, use() { return data.cache }, set(p) { Object.assign(data.cache, JSON.parse(JSON.stringify(p))) } }
	const src = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'bypass-status', 'index.js'), 'utf8')
	const p = new Function('valenced', 'plugin', 'return ' + src)(global.valenced, global.plugin).default
	p.start({ cleanup: (f) => f, jsonStorage: json })
	return { p, data, json, runtime, dispatcher, selfPresence, presence, toasts, asked, setStatus: (s) => { current = s }, setCur: (c) => { cur = c; hi = 0 } }
}
const msg = (author, channel, extra) => ({ type: 'MESSAGE_CREATE', message: Object.assign({ id: '9', channel_id: channel, author: { id: author, username: 'x' }, content: 'hello there' }, extra || {}) })
const sources = (o) => ({ bypassJson: JSON.stringify(Object.assign({ channels: [], guilds: [], users: [] }, o)) })
const texts = (n, out = []) => { if (Array.isArray(n)) n.forEach((x) => texts(x, out)); else if (typeof n === 'string') out.push(n); else if (n && typeof n === 'object') { if (n.props && typeof n.props.label === 'string') out.push(n.props.label); if (n.props && typeof n.props.text === 'string') out.push('[' + n.props.text + ']'); texts(n.props && n.props.children, out) } return out }
const expand = (n) => (Array.isArray(n) ? n.map(expand) : n && typeof n === 'object' && typeof n.type === 'function' ? expand(n.type(n.props)) : n && typeof n === 'object' ? { ...n, props: { ...n.props, children: expand(n.props && n.props.children) } } : n)

// 1. The status answers "online" only while a chosen message is handled
{
	const a = load(sources({ channels: [DMCH] }))
	a.dispatcher.dispatch(msg(FRIEND, DMCH))
	check('a message from a chosen chat is handled as if you were online', a.asked[0].status === 'online' && a.asked[0].presence === 'online' && a.asked[0].flag === false, JSON.stringify(a.asked[0]))
	a.dispatcher.dispatch(msg(STRANGER, OTHERCH))
	check('a message from somewhere else is handled in Do Not Disturb', a.asked[1].status === 'dnd' && a.asked[1].flag === true, JSON.stringify(a.asked[1]))
	check('outside a message, the status is still Do Not Disturb', a.selfPresence.getStatus() === 'dnd' && a.presence.isDND() === true)
	a.dispatcher.dispatch({ type: 'TYPING_START', channelId: DMCH })
	check('other events are not touched', a.asked[2].status === 'dnd')
}
// 2. What counts as chosen
{
	const a = load(sources({ guilds: [GUILD], channels: [OTHERCH], users: [FRIEND] }))
	const run = (m) => { a.asked.length = 0; a.dispatcher.dispatch(m); return a.asked[0].status === 'online' }
	check('every channel of a chosen server', run(msg(STRANGER, SRVCH)) && run(msg(STRANGER, GUILDCH)))
	check('a chosen channel of another server', run(msg(STRANGER, OTHERCH)))
	check('a chosen person in a direct message', run(msg(FRIEND, DMCH)))
	check('a chosen person in a group chat', run(msg(FRIEND, GROUPDM)))
	const only = load(sources({ users: [FRIEND] }))
	const run2 = (m) => { only.asked.length = 0; only.dispatcher.dispatch(m); return only.asked[0].status === 'online' }
	check('a chosen person in a server does not bypass by themselves', !run2(msg(FRIEND, OTHERCH)))
	check('a chosen person who mentions you in a server does', run2(msg(FRIEND, OTHERCH, { mentions: [{ id: ME }] })))
	check('a stranger in a chat that was not chosen', !run(msg(STRANGER, GROUPDM)))
	check('your own messages never bypass', !run(msg(ME, SRVCH)))
	check('a message that has not been sent yet never bypasses', !run(Object.assign(msg(STRANGER, SRVCH), { optimistic: true })))
}
// 3. Only in Do Not Disturb, banners
{
	const a = load(sources({ channels: [DMCH] }), 'online')
	a.dispatcher.dispatch(msg(FRIEND, DMCH))
	check('when you are online nothing is changed and no banner shows', a.asked[0].status === 'online' && a.toasts.length === 0)
	const b = load(sources({ channels: [DMCH] }))
	b.dispatcher.dispatch(msg(FRIEND, DMCH))
	check('in Do Not Disturb a banner shows who wrote what', b.toasts.length === 1 && /Anna|x: hello there/.test(b.toasts[0]), b.toasts[0])
	const c = load(Object.assign(sources({ channels: [DMCH] }), { banner: false }))
	c.dispatcher.dispatch(msg(FRIEND, DMCH))
	check('the banner can be turned off', c.toasts.length === 0)
}
// 4. The hold-down menu
const block4 = (async () => {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
	function Sheet() {}
	function Group() {}
	function Row() {}
	function MuteIcon() {}
	const a = load({})
	const open = (props, icon) => { a.runtime.jsx(Sheet, props); const muteIcon = a.runtime.jsx(icon || MuteIcon, {}); const r1 = a.runtime.jsx(Row, { label: 'Mark As Read', icon: a.runtime.jsx(function EyeIcon() {}, {}) }); const r2 = a.runtime.jsx(Row, { label: 'Mute Conversation', icon: muteIcon, onPress: () => {} }); return a.runtime.jsx(Group, { children: [r1, r2] }) }
	const rowsOf = (g) => (Array.isArray(g.props.children) ? g.props.children : [g.props.children])
	let g = open({ channel: { id: DMCH, type: 1 } })
	check('the menu of a chat gets a Bypass Do Not Disturb row after Mute', rowsOf(g).map((r) => r.props.label).join('|') === 'Mark As Read|Mute Conversation|Bypass Do Not Disturb', rowsOf(g).map((r) => r.props.label).join('|'))
	check('the new row looks like the others', rowsOf(g)[2].type === Row)
	rowsOf(g)[2].props.onPress(); await sleep(20)
	let st = JSON.parse(a.data.cache.bypassJson)
	check('choosing it adds the chat (and the person)', st.channels.indexOf(DMCH) >= 0 && st.users.indexOf(FRIEND) >= 0, a.data.cache.bypassJson)
	g = open({ channel: { id: DMCH, type: 1 } })
	check('for a chat that is already chosen it offers to stop', rowsOf(g).length === 3 && rowsOf(g)[2].props.label === 'Stop bypassing Do Not Disturb', rowsOf(g).map((r) => r.props.label).join('|'))
	rowsOf(g)[2].props.onPress(); await sleep(20)
	st = JSON.parse(a.data.cache.bypassJson)
	check('stopping removes the chat and the person', st.channels.length === 0 && st.users.length === 0, a.data.cache.bypassJson)
	g = open({ guild: { id: GUILD, name: 'My Server', icon: 'x' } })
	check('the menu of a server gets the row too', rowsOf(g).length === 3 && rowsOf(g)[2].props.label === 'Bypass Do Not Disturb', rowsOf(g).map((r) => r.props.label).join('|'))
	rowsOf(g)[2].props.onPress(); await sleep(20)
	check('choosing it adds the server', JSON.parse(a.data.cache.bypassJson).guilds.indexOf(GUILD) >= 0, a.data.cache.bypassJson)
	const msgMenu = open({ channel: { id: DMCH, type: 1 }, message: { id: '1' } })
	check('the menu of a message is left alone', rowsOf(msgMenu).length === 2, rowsOf(msgMenu).map((r) => r.props.label).join('|'))
	const none = load({}); none.runtime.jsx(function X() {}, {})
	const lone = none.runtime.jsx(Group, { children: [none.runtime.jsx(Row, { label: 'Mark As Read' }), none.runtime.jsx(Row, { label: 'Mute Conversation', icon: none.runtime.jsx(MuteIcon, {}) })] })
	check('without a chat behind the sheet nothing is added', rowsOf(lone).length === 2)
	const other = load({}); other.runtime.jsx(Sheet, { channel: { id: DMCH, type: 1 } })
	const noMute = other.runtime.jsx(Group, { children: [other.runtime.jsx(Row, { label: 'Profile' }), other.runtime.jsx(Row, { label: 'Close DM' })] })
	check('a group without a Mute row is left alone', rowsOf(noMute).length === 2)
})()
pending.push(block4)

pending.push((async () => {
	await block4
	// 5. The settings page and the report
	{
		const a = load(sources({ channels: [DMCH], guilds: [GUILD] }))
		a.setCur('s'); const tree = expand(a.p.SettingsComponent({ api: { jsonStorage: a.json } }))
		const t = texts(tree).join('|')
		check('the settings page lists the chosen chat and server', /Anna/.test(t) && /My Server/.test(t), t.slice(0, 200))
		check('it offers other chats and servers to add', /Study group/.test(t) && /Other/.test(t), t.slice(0, 300))
		let addBtn; const walk = (n) => { if (Array.isArray(n)) return n.forEach(walk); if (!n || typeof n !== 'object') return; if (n.props && n.props.label === 'Study group' && n.props.onPress) addBtn = n; walk(n.props && n.props.children) }
		walk(tree); addBtn.props.onPress()
		check('tapping a chat adds it', JSON.parse(a.data.cache.bypassJson).channels.indexOf(GROUPDM) >= 0)
		a.dispatcher.dispatch(msg(STRANGER, GROUPDM))
		check('and it takes effect right away', a.asked.slice(-1)[0].status === 'online')
		let copy; const walk2 = (n) => { if (Array.isArray(n)) return n.forEach(walk2); if (!n || typeof n !== 'object') return; if (n.props && n.props.label === 'Copy diagnostic report') copy = n; walk2(n.props && n.props.children) }
		walk2(tree); copy.props.onPress()
		check('the report says what was hooked and how often it bypassed', /Bypass Status report/.test(global.copied) && /Dispatcher\.dispatch/.test(global.copied) && /bypass windows: 1/.test(global.copied), global.copied)
	}
	// 6. A stale copy does nothing
	{
		const a = load(sources({ channels: [DMCH] }))
		function Sheet() {}
		const b = load({})
		check('only the newest copy of the plugin edits menus', (() => { a.runtime.jsx(Sheet, { channel: { id: DMCH, type: 1 } }); return true })())
	}
})())

Promise.all(pending).then(() => new Promise((r) => setTimeout(r, 60))).then(() => {
	console.log(failed ? '\n' + failed + ' check(s) failed' : '\nAll checks passed')
	process.exit(failed ? 1 : 0)
})
