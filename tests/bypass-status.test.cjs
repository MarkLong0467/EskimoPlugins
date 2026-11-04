// Mock tests for Bypass Status. Run with: node tests/bypass-status.test.cjs
const fs = require('fs')
const path = require('path')
let failed = 0
const pending = []
const check = (name, ok, extra) => {
	console.log(`${ok ? 'ok   ' : 'FAIL '}${name}${ok || extra === undefined ? '' : `  -> ${extra}`}`)
	if (!ok) failed += 1
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ME = '100000000000000001'
const ANNA = '200000000000000002'
const EVE = '300000000000000003'
const DM_ANNA = '400000000000000004'
const GROUP = '400000000000000005'
const GENERAL = '500000000000000005' // a channel of the server
const SERVER = '600000000000000006'
const OTHER_SERVER = '600000000000000007'

/**
 * Loads a fresh copy of the plugin against a small fake of Discord.
 * The fake `shouldNotify` behaves like the real one in the decompiled app: "no" in Do Not Disturb unless ignoreStatus.
 */
function load(settings = {}, options = {}) {
	const state = { status: options.status || 'dnd', viewing: undefined }
	const channels = {
		[DM_ANNA]: { id: DM_ANNA, type: 1, recipients: [ANNA] },
		[GROUP]: { id: GROUP, type: 3, name: 'Study group', recipients: [ANNA, EVE] },
		[GENERAL]: { id: GENERAL, type: 0, name: 'general', guild_id: SERVER },
	}
	const users = { [ME]: { id: ME, username: 'me' }, [ANNA]: { id: ANNA, username: 'anna', globalName: 'Anna' }, [EVE]: { id: EVE, username: 'eve' } }
	const guilds = { [SERVER]: { id: SERVER, name: 'My Server' }, [OTHER_SERVER]: { id: OTHER_SERVER, name: 'Other' } }
	const toasts = []
	const vibrations = []
	const hooks = {}
	let cur = 'x'
	let hi = 0
	const React = {
		useState: (initial) => { const h = (hooks[cur] = hooks[cur] || []); const k = hi++; if (!(k in h)) h[k] = initial; return [h[k], (v) => { h[k] = typeof v === 'function' ? v(h[k]) : v }] },
		useEffect: () => {},
		createElement: (type, props, ...c) => ({ type, props: { ...props, children: c.length > 1 ? c : c[0] }, key: props && props.key }),
		cloneElement: (element, props, ...c) => ({ ...element, props: { ...element.props, ...props, ...(c.length ? { children: c.length > 1 ? c : c[0] } : {}) } }),
	}
	const runtime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
	const calls = []
	const notificationUtils = options.noUtils ? null : {
		shouldNotifyBase() {},
		shouldNotify(message, channelId, includeSelected, ignoreStatus) {
			calls.push({ includeSelected, ignoreStatus })
			return !!ignoreStatus || state.status !== 'dnd'
		},
	}
	const dispatcher = { dispatch() {}, subscribe() {}, unsubscribe() {} }
	let clipboard = ''
	global.valenced = {
		react: { React, ReactNative: { View: 'V', ScrollView: 'S', Pressable: 'P', Vibration: { vibrate: (ms) => vibrations.push(ms) } }, ReactJSXRuntime: runtime },
		externals: { ReactNativeClipboard: { Clipboard: { setString: (text) => { global.copied = text }, getString: async () => clipboard } } },
		discord: {
			flux: {
				Stores: {
					SelfPresenceStore: { getStatus: () => state.status },
					ChannelStore: { getChannel: (id) => channels[id] }, UserStore: { getUser: (id) => users[id], getCurrentUser: () => users[ME] },
					GuildStore: { getGuild: (id) => guilds[id], getGuilds: () => guilds }, PrivateChannelSortStore: { getPrivateChannelIds: () => [DM_ANNA, GROUP] },
					SelectedChannelStore: { getChannelId: () => state.viewing },
				},
				FluxDispatcher: dispatcher,
			},
			actions: { ToastActionCreators: { open: (key, opts) => toasts.push(opts.text) }, ActionSheetActionCreators: { hideAllActionSheets: () => {} } },
			design: { Design: new Proxy({}, { get: (_, key) => key }) },
		},
		patcher: {
			after: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { const r = original.apply(this, a); const x = fn.call(this, r); return x === undefined ? r : x }; return () => { object[key] = original } },
			instead: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { return fn.call(this, a, original) }; return () => { object[key] = original } },
		},
		modules: { finders: { filters: { withProps: (...n) => n.join() }, lookupModule: (f) => (f === 'jsx,jsxs' ? [runtime] : f === 'shouldNotify,shouldNotifyBase' && notificationUtils ? [notificationUtils] : []) } },
	}
	global.plugin = (definition) => definition
	const data = { cache: { ...settings } }
	const json = { get cache() { return data.cache }, use() { return data.cache }, set(patch) { Object.assign(data.cache, JSON.parse(JSON.stringify(patch))) } }
	const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'bypass-status', 'index.js'), 'utf8')
	const plugin = new Function('valenced', 'plugin', `return ${source}`)(global.valenced, global.plugin).default
	plugin.start({ cleanup: (fn) => fn, jsonStorage: json })
	return { plugin, data, json, runtime, dispatcher, notificationUtils, calls, toasts, vibrations, state, setClipboard: (t) => { clipboard = t }, setScreen: (name) => { cur = name; hi = 0 } }
}

const listOf = (lists) => ({ listsJson: JSON.stringify({ users: [], channels: [], guilds: [], ...lists }) })
const message = (author, channel, extra = {}) => ({ id: '9', channel_id: channel, guild_id: channel === GENERAL ? SERVER : undefined, author: { id: author, username: 'x' }, content: 'hello there', ...extra })
const texts = (node, out = []) => {
	if (Array.isArray(node)) node.forEach((n) => texts(n, out))
	else if (typeof node === 'string') out.push(node)
	else if (node && typeof node === 'object') {
		if (node.props && typeof node.props.label === 'string') out.push(node.props.label)
		if (node.props && typeof node.props.text === 'string') out.push(`[${node.props.text}]`)
		texts(node.props && node.props.children, out)
	}
	return out
}
const expand = (node) => (Array.isArray(node) ? node.map(expand) : node && typeof node === 'object' && typeof node.type === 'function' ? expand(node.type(node.props)) : node && typeof node === 'object' ? { ...node, props: { ...node.props, children: expand(node.props && node.props.children) } } : node)
const findAll = (tree, test, out = []) => { if (Array.isArray(tree)) tree.forEach((n) => findAll(n, test, out)); else if (tree && typeof tree === 'object') { if (test(tree)) out.push(tree); findAll(tree.props && tree.props.children, test, out) } return out }
const asks = (app, msg, channel) => app.notificationUtils.shouldNotify(msg, channel || msg.channel_id, true)

// 1. Discord's own function is asked again with ignoreStatus, for the right people
{
	const app = load(listOf({ users: [ANNA], channels: [GROUP], guilds: [SERVER] }))
	check('without the plugin Discord says no in Do Not Disturb (the fake behaves like the real function)', (() => { const raw = load({}, { status: 'dnd' }); return raw.notificationUtils.shouldNotify(message(ANNA, DM_ANNA), DM_ANNA, true) === false })())
	check('a chosen person in a direct message gets through', asks(app, message(ANNA, DM_ANNA)) === true)
	check('a stranger does not', asks(app, message(EVE, DM_ANNA)) === false)
	check('anyone in a chosen group chat gets through', asks(app, message(EVE, GROUP)) === true)
	check('anyone in a chosen server gets through', asks(app, message(EVE, GENERAL)) === true)
	check('a message of another server does not', asks(app, message(EVE, '999000000000000009')) === false)
	const last = app.calls[app.calls.length - 1]
	app.calls.length = 0
	asks(app, message(ANNA, DM_ANNA))
	check('Discord is asked again with ignoreStatus = true and the other arguments unchanged', app.calls.length === 1 && app.calls[0].ignoreStatus === true && app.calls[0].includeSelected === true, JSON.stringify(app.calls))
	const everyone = load({ everyone: true })
	check('with "Everyone" on, anybody gets through', asks(everyone, message(EVE, DM_ANNA)) === true)
	const online = load(listOf({ users: [ANNA] }), { status: 'online' })
	online.calls.length = 0
	asks(online, message(ANNA, DM_ANNA))
	check('when you are not in Do Not Disturb nothing is changed', online.calls[0].ignoreStatus === undefined, JSON.stringify(online.calls))
	const explicit = load(listOf({ users: [ANNA] }))
	explicit.calls.length = 0
	explicit.notificationUtils.shouldNotify(message(ANNA, DM_ANNA), DM_ANNA, true, true)
	check('a call that already ignores the status is left alone', explicit.calls.length === 1)
	check('a message without an author is left alone', asks(load(listOf({ users: [ANNA] })), { id: '1', channel_id: DM_ANNA, content: 'x' }) === false)
}

// 2. The settings: paste IDs, one switch for everyone
pending.push((async () => {
	const app = load({})
	app.setScreen('s')
	let tree = expand(app.plugin.SettingsComponent({ api: { jsonStorage: app.json } }))
	const shown = () => texts(tree).join('|')
	const press = (label) => findAll(tree, (n) => n.props && n.props.text === label && n.props.onPress)[0].props.onPress()
	check('the screen has the Everyone switch and a place to paste IDs', /Everyone/.test(shown()) && findAll(tree, (n) => n.type === 'TextInput' && n.props.label === 'User IDs').length === 1, shown().slice(0, 200))
	const redraw = () => { app.setScreen('s'); tree = expand(app.plugin.SettingsComponent({ api: { jsonStorage: app.json } })) }
	const type = (text) => findAll(tree, (n) => n.type === 'TextInput' && n.props.label === 'User IDs')[0].props.onChange(text)
	type(`${ANNA}, ${EVE}\n  and also junk 12345 and ${ANNA}`); redraw(); press('Add'); redraw()
	let list = JSON.parse(app.data.cache.listsJson)
	check('pasted IDs are found among other text, once each', list.users.length === 2 && list.users.includes(ANNA) && list.users.includes(EVE), app.data.cache.listsJson)
	check('the people show with their names and IDs', /Anna/.test(shown()) && findAll(tree, (n) => n.props && typeof n.props.subLabel === 'string' && n.props.subLabel.includes(ANNA)).length === 1, shown().slice(0, 300))
	check('the pasted text is cleared after Add', findAll(tree, (n) => n.type === 'TextInput' && n.props.label === 'User IDs')[0].props.value === '')
	type(ANNA); redraw(); press('Add'); redraw()
	check('an ID that is already there is not added twice', JSON.parse(app.data.cache.listsJson).users.length === 2)
	app.setClipboard(`ids: ${'700000000000000007'}`)
	press('Add from clipboard'); await sleep(10)
	check('IDs can be added from the clipboard', JSON.parse(app.data.cache.listsJson).users.includes('700000000000000007'))
	findAll(tree, (n) => n.props && n.props.label === 'Anna' && n.props.onPress)[0].props.onPress()
	check('tapping a person removes them', !JSON.parse(app.data.cache.listsJson).users.includes(ANNA))
	findAll(tree, (n) => n.type === 'TableSwitchRow' && n.props.label === 'Everyone')[0].props.onValueChange(true); redraw()
	check('the Everyone switch saves', app.data.cache.everyone === true)
	check('with Everyone on, the lists are hidden', !/Find a chat or a server/.test(shown()) && findAll(tree, (n) => n.type === 'TextInput' && n.props.label === 'User IDs').length === 0, shown().slice(0, 200))
	check('...and the card says everyone can notify you', /Everyone can notify you/.test(shown()))
	findAll(tree, (n) => n.props && n.props.label === 'Copy report')
	press('Copy report')
	check('the report says whether Discord\'s function was found', /Bypass Status report/.test(global.copied) && /notification function: found/.test(global.copied) && /NotificationTextUtils\.shouldNotify/.test(global.copied), global.copied)
})())

// 3. The banner of its own
pending.push((async () => {
	await sleep(50)
	const event = (author, channel, extra = {}) => ({ type: 'MESSAGE_CREATE', message: message(author, channel, extra) })
	const withFunction = load(listOf({ users: [ANNA] }))
	withFunction.dispatcher.dispatch(event(ANNA, DM_ANNA))
	check('with Discord\'s function found, no banner of its own by default', withFunction.toasts.length === 0)
	const both = load({ ...listOf({ users: [ANNA] }), ownBanner: true })
	both.dispatcher.dispatch(event(ANNA, DM_ANNA, { author: { id: ANNA, username: 'anna', global_name: 'Anna' }, content: 'hi <@' + EVE + '> see <#' + GENERAL + '>' }))
	check('turned on, it shows who wrote what and buzzes once', both.toasts[0] === 'Anna: hi @eve see #general' && both.vibrations.length === 1, both.toasts[0])
	const missing = load(listOf({ users: [ANNA] }), { noUtils: true })
	missing.dispatcher.dispatch(event(ANNA, DM_ANNA))
	check('if Discord\'s function is not found the banner is used on its own', missing.toasts.length === 1, String(missing.toasts.length))
	missing.dispatcher.dispatch(event(EVE, DM_ANNA))
	missing.dispatcher.dispatch(event(ME, DM_ANNA))
	missing.dispatcher.dispatch(event(ANNA, DM_ANNA, { flags: 1 << 12 }))
	missing.dispatcher.dispatch({ ...event(ANNA, DM_ANNA), optimistic: true })
	missing.dispatcher.dispatch({ type: 'TYPING_START' })
	check('...and it ignores strangers, your own, silent and unsent messages', missing.toasts.length === 1, String(missing.toasts.length))
	const online = load({ ...listOf({ users: [ANNA] }), ownBanner: true }, { status: 'online' })
	online.dispatcher.dispatch(event(ANNA, DM_ANNA))
	check('when you are not in Do Not Disturb there is no banner', online.toasts.length === 0)
	const everyone = load({ everyone: true, ownBanner: true })
	everyone.dispatcher.dispatch(event(EVE, DM_ANNA))
	check('with Everyone on, everybody gets the banner', everyone.toasts.length === 1)
})())

// 4. The hold-down menu
pending.push((async () => {
	await sleep(100)
	function Sheet() {}
	function Group() {}
	function Row() {}
	function MuteIcon() {}
	const app = load({})
	const open = (props) => {
		app.runtime.jsx(Sheet, props)
		const rows = [app.runtime.jsx(Row, { label: 'Mark As Read', icon: app.runtime.jsx(function EyeIcon() {}, {}) }), app.runtime.jsx(Row, { label: 'Mute Conversation', icon: app.runtime.jsx(MuteIcon, {}), onPress: () => {} })]
		return app.runtime.jsx(Group, { children: rows })
	}
	const rowsOf = (group) => (Array.isArray(group.props.children) ? group.props.children : [group.props.children])
	const labels = (group) => rowsOf(group).map((r) => r.props.label).join('|')
	const press = async (group) => { rowsOf(group)[2].props.onPress(); await sleep(15) }
	const list = () => JSON.parse(app.data.cache.listsJson)

	let group = open({ channel: { id: DM_ANNA, type: 1 } })
	check('a direct message gets the row after Mute', labels(group) === 'Mark As Read|Mute Conversation|Bypass Do Not Disturb', labels(group))
	await press(group)
	check('choosing it adds the person', list().users.includes(ANNA) && list().channels.length === 0, app.data.cache.listsJson)
	group = open({ channel: { id: DM_ANNA, type: 1 } })
	check('then it offers to stop', rowsOf(group)[2].props.label === 'Stop bypassing Do Not Disturb')
	await press(group)
	check('stopping removes the person', list().users.length === 0)
	await press(open({ channel: { id: GROUP, type: 3 } }))
	check('a group chat is saved as itself', list().channels.includes(GROUP))
	await press(open({ channel: { id: GENERAL, type: 0, guild_id: SERVER, name: 'general' } }))
	check('a channel is saved as itself', list().channels.includes(GENERAL))
	await press(open({ guild: { id: SERVER, name: 'My Server', icon: 'x' } }))
	check('a server is saved as a server', list().guilds.includes(SERVER))
	check('the menu of a message is left alone', rowsOf(open({ channel: { id: DM_ANNA, type: 1 }, message: { id: '1' } })).length === 2)
	const plain = load({}); plain.runtime.jsx(Sheet, { channel: { id: DM_ANNA, type: 1 } })
	check('a group without a Mute row is left alone', rowsOf(plain.runtime.jsx(Group, { children: [plain.runtime.jsx(Row, { label: 'Profile' }), plain.runtime.jsx(Row, { label: 'Close DM' })] })).length === 2)
})())

Promise.all(pending).then(() => sleep(300)).then(() => {
	console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
	process.exit(failed ? 1 : 0)
})
