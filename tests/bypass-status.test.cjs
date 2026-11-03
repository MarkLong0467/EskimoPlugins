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
const RANDOM = '500000000000000006' // a channel of another server
const SERVER = '600000000000000006'
const OTHER_SERVER = '600000000000000007'
const ROLE = '800000000000000008'

/** Loads a fresh copy of the plugin against a small fake of Discord. */
function load(settings = {}, options = {}) {
	const state = { status: options.status || 'dnd', viewing: options.viewing, appState: 'active' }
	const channels = {
		[DM_ANNA]: { id: DM_ANNA, type: 1, recipients: [ANNA] },
		[GROUP]: { id: GROUP, type: 3, name: 'Study group', recipients: [ANNA, EVE] },
		[GENERAL]: { id: GENERAL, type: 0, name: 'general', guild_id: SERVER },
		[RANDOM]: { id: RANDOM, type: 0, name: 'random', guild_id: OTHER_SERVER },
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
	const asked = []
	const selfPresence = { getStatus: () => state.status }
	const presence = { getStatus: () => state.status, isDND: () => state.status === 'dnd' }
	const dispatcher = {
		dispatch(event) { asked.push({ type: event.type, status: selfPresence.getStatus(), flag: presence.isDND() }) },
		subscribe() {}, unsubscribe() {},
	}
	global.valenced = {
		react: { React, ReactNative: { View: 'V', ScrollView: 'S', Pressable: 'P', Vibration: { vibrate: (ms) => vibrations.push(ms) }, AppState: { get currentState() { return state.appState } } }, ReactJSXRuntime: runtime },
		externals: { ReactNativeClipboard: { Clipboard: { setString: (text) => { global.copied = text } } } },
		discord: {
			flux: {
				Stores: {
					SelfPresenceStore: selfPresence, PresenceStore: presence,
					ChannelStore: { getChannel: (id) => channels[id] }, UserStore: { getUser: (id) => users[id], getCurrentUser: () => users[ME] },
					GuildStore: { getGuild: (id) => guilds[id], getGuilds: () => guilds }, PrivateChannelSortStore: { getPrivateChannelIds: () => [DM_ANNA, GROUP] },
					SelectedChannelStore: { getChannelId: () => state.viewing }, GuildMemberStore: { getMember: () => ({ roles: [ROLE] }) },
				},
				FluxDispatcher: dispatcher,
			},
			actions: { ToastActionCreators: { open: (key, options2) => toasts.push(options2.text) }, ActionSheetActionCreators: { hideAllActionSheets: () => {} } },
			design: { Design: new Proxy({}, { get: (_, key) => key }) },
		},
		patcher: {
			after: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { const r = original.apply(this, a); const x = fn.call(this, r); return x === undefined ? r : x }; return () => { object[key] = original } },
			instead: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { return fn.call(this, a, original) }; return () => { object[key] = original } },
		},
		modules: { finders: { filters: { withProps: (...n) => n.join() }, lookupModule: (f) => (f === 'jsx,jsxs' ? [runtime] : []) } },
	}
	global.plugin = (definition) => definition
	const data = { cache: { ...settings } }
	const json = { get cache() { return data.cache }, use() { return data.cache }, set(patch) { Object.assign(data.cache, JSON.parse(JSON.stringify(patch))) } }
	const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'bypass-status', 'index.js'), 'utf8')
	const plugin = new Function('valenced', 'plugin', `return ${source}`)(global.valenced, global.plugin).default
	plugin.start({ cleanup: (fn) => fn, jsonStorage: json })
	return { plugin, data, json, runtime, dispatcher, asked, toasts, vibrations, state, setScreen: (name) => { cur = name; hi = 0 } }
}

const listOf = (lists) => ({ listsJson: JSON.stringify({ users: [], channels: [], guilds: [], ...lists }) })
const message = (author, channel, extra = {}) => ({
	type: 'MESSAGE_CREATE',
	message: { id: '9', channel_id: channel, guild_id: channel === GENERAL ? SERVER : channel === RANDOM ? OTHER_SERVER : undefined, author: { id: author, username: 'x' }, content: 'hello there', ...extra },
})
const mentionsMe = { mentions: [{ id: ME }] }
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

/** Sends a message through the fake dispatcher and says whether it got through. */
function gotThrough(app, event) {
	app.asked.length = 0
	const before = app.toasts.length
	app.dispatcher.dispatch(event)
	return { passed: app.toasts.length > before, status: app.asked[0] && app.asked[0].status }
}

// 1. Who gets through
{
	const app = load(listOf({ users: [ANNA], channels: [GROUP, RANDOM], guilds: [SERVER] }))
	check('a chosen person in a direct message', gotThrough(app, message(ANNA, DM_ANNA)).passed)
	check('a chosen person in a group chat', gotThrough(app, message(ANNA, GROUP)).passed)
	check('anyone in a chosen group chat', gotThrough(app, message(EVE, GROUP)).passed)
	check('a stranger in a chat that is not on the list', !gotThrough(app, message(EVE, DM_ANNA)).passed)
	check('a chosen server: only when you are mentioned', !gotThrough(app, message(EVE, GENERAL)).passed && gotThrough(app, message(EVE, GENERAL, mentionsMe)).passed)
	check('a chosen channel: only when you are mentioned', !gotThrough(app, message(EVE, RANDOM)).passed && gotThrough(app, message(EVE, RANDOM, mentionsMe)).passed)
	check('@everyone counts as a mention', gotThrough(app, message(EVE, GENERAL, { mention_everyone: true })).passed)
	check('a role you have counts as a mention', gotThrough(app, message(EVE, GENERAL, { mention_roles: [ROLE] })).passed)
	check('a role you do not have does not', !gotThrough(app, message(EVE, GENERAL, { mention_roles: ['999'] })).passed)
	const all = load({ ...listOf({ guilds: [SERVER] }), onlyMentions: false })
	check('with "only when mentioned" off, every message of a chosen server', gotThrough(all, message(EVE, GENERAL)).passed)
	const person = load(listOf({ users: [ANNA] }))
	check('a chosen person in a server does not get through on their own', !gotThrough(person, message(ANNA, GENERAL, mentionsMe)).passed)
	const outside = load({ ...listOf({ users: [ANNA] }), allowOutsideOfDms: true })
	check('with "also in servers" on, a chosen person who mentions you', gotThrough(outside, message(ANNA, GENERAL, mentionsMe)).passed && !gotThrough(outside, message(ANNA, GENERAL)).passed)
}

// 2. What never gets through
{
	const list = listOf({ users: [ANNA] })
	check('your own messages', !gotThrough(load(list), message(ME, DM_ANNA)).passed)
	check('a message that is not sent yet', !gotThrough(load(list), { ...message(ANNA, DM_ANNA), optimistic: true }).passed)
	check('an empty message', !gotThrough(load(list), message(ANNA, DM_ANNA, { content: '' })).passed)
	check('a message with only a picture', gotThrough(load(list), message(ANNA, DM_ANNA, { content: '', attachments: [{ id: '1' }] })).passed)
	check('a silent message', !gotThrough(load(list), message(ANNA, DM_ANNA, { flags: 1 << 12 })).passed)
	check('a silent message when silent messages are not respected', gotThrough(load({ ...list, respectSilentPings: false }), message(ANNA, DM_ANNA, { flags: 1 << 12 })).passed)
	check('the chat you are looking at', !gotThrough(load(list, { viewing: DM_ANNA }), message(ANNA, DM_ANNA)).passed)
	const away = load(list, { viewing: DM_ANNA }); away.state.appState = 'background'
	check('the chat you were in, when the app is in the background', gotThrough(away, message(ANNA, DM_ANNA)).passed)
	check('when your status is online', !gotThrough(load(list, { status: 'online' }), message(ANNA, DM_ANNA)).passed)
	check('when your status is idle (not the one you chose)', !gotThrough(load(list, { status: 'idle' }), message(ANNA, DM_ANNA)).passed)
	check('an event that is not a new message', (() => { const app = load(list); app.dispatcher.dispatch({ type: 'TYPING_START' }); return app.toasts.length === 0 })())
}

// 3. The status to use
{
	const list = listOf({ users: [ANNA] })
	check('idle can be the status to use', gotThrough(load({ ...list, statusToUse: 'idle' }, { status: 'idle' }), message(ANNA, DM_ANNA)).passed)
	check('...and then Do Not Disturb no longer is', !gotThrough(load({ ...list, statusToUse: 'idle' }, { status: 'dnd' }), message(ANNA, DM_ANNA)).passed)
}

// 4. How you are told
{
	const list = listOf({ users: [ANNA], guilds: [SERVER] })
	const app = load(list)
	gotThrough(app, message(ANNA, DM_ANNA, { author: { id: ANNA, username: 'anna', global_name: 'Anna' }, content: 'hi <@' + EVE + '> see <#' + GENERAL + '>' }))
	check('the banner says who wrote what, with names for mentions', app.toasts[0] === 'Anna: hi @eve see #general', app.toasts[0])
	check('the phone buzzes once', app.vibrations.length === 1 && app.vibrations[0] === 200)
	gotThrough(app, message(EVE, GENERAL, { ...mentionsMe, author: { id: EVE, username: 'eve' } }))
	check('a server message says in which channel', app.toasts[1] === 'eve in #general: hello there', app.toasts[1])
	const quiet = load({ ...list, showBanner: false, vibrate: false })
	gotThrough(quiet, message(ANNA, DM_ANNA))
	check('banner and buzz can be turned off', quiet.toasts.length === 0 && quiet.vibrations.length === 0)
}

// 5. Letting Discord notify too
{
	const list = listOf({ users: [ANNA] })
	const on = load(list)
	on.dispatcher.dispatch(message(ANNA, DM_ANNA)); on.dispatcher.dispatch(message(EVE, DM_ANNA))
	check('while Discord handles the message the status stores answer online', on.asked[0].status === 'online' && on.asked[0].flag === false)
	check('other messages still see Do Not Disturb', on.asked[1].status === 'dnd' && on.asked[1].flag === true)
	const off = load({ ...list, letDiscordNotify: false })
	off.dispatcher.dispatch(message(ANNA, DM_ANNA))
	check('the switch turns this off', off.asked[0].status === 'dnd')
}

// 6. The hold-down menu
pending.push((async () => {
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
	check('the row looks like the others', rowsOf(group)[2].type === Row)
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
	const lone = load({}); lone.runtime.jsx(function X() {}, {})
	check('without a chat behind the sheet nothing is added', rowsOf(lone.runtime.jsx(Group, { children: [lone.runtime.jsx(Row, { label: 'Mark As Read' }), lone.runtime.jsx(Row, { label: 'Mute', icon: lone.runtime.jsx(MuteIcon, {}) })] })).length === 2)
	const plain = load({}); plain.runtime.jsx(Sheet, { channel: { id: DM_ANNA, type: 1 } })
	check('a group without a Mute row is left alone', rowsOf(plain.runtime.jsx(Group, { children: [plain.runtime.jsx(Row, { label: 'Profile' }), plain.runtime.jsx(Row, { label: 'Close DM' })] })).length === 2)
})())

// 7. The settings screen
pending.push((async () => {
	await sleep(120)
	const app = load(listOf({ users: [ANNA], guilds: [SERVER] }))
	app.setScreen('settings')
	const tree = expand(app.plugin.SettingsComponent({ api: { jsonStorage: app.json } }))
	const shown = texts(tree).join('|')
	check('the screen lists the chosen person and server', /Anna/.test(shown) && /My Server/.test(shown), shown.slice(0, 200))
	check('it offers other chats and servers', /Study group/.test(shown) && /Other/.test(shown))
	const tap = (label) => findAll(tree, (n) => n.props && n.props.label === label && n.props.onPress)[0]
	tap('Study group').props.onPress()
	check('tapping a chat adds it', JSON.parse(app.data.cache.listsJson).channels.includes(GROUP))
	tap('Other').props.onPress()
	check('tapping a server adds it', JSON.parse(app.data.cache.listsJson).guilds.includes(OTHER_SERVER))
	const radio = findAll(tree, (n) => n.type === 'TableRadioGroup')[0]
	radio.props.onChange('idle')
	check('the status to use can be changed', app.data.cache.statusToUse === 'idle')
	const switches = findAll(tree, (n) => n.type === 'TableSwitchRow' && n.props.label)
	check('every rule and notice has a switch', switches.length === 6, String(switches.length))
	findAll(tree, (n) => n.type === 'TableSwitchRow' && /Vibrate/.test(n.props.label))[0].props.onValueChange(false)
	check('a switch saves', app.data.cache.vibrate === false)
	findAll(tree, (n) => n.props && n.props.label === 'Copy diagnostic report')[0].props.onPress()
	check('the report names the hooks and the counts', /Bypass Status report/.test(global.copied) && /Dispatcher\.dispatch/.test(global.copied) && /messages let through/.test(global.copied), global.copied)
})())

Promise.all(pending).then(() => sleep(200)).then(() => {
	console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
	process.exit(failed ? 1 : 0)
})
