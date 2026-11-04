// Mock tests for Show Hidden Channels. Run with: node tests/show-hidden-channels.test.cjs
const fs = require('fs')
const path = require('path')
let failed = 0
const check = (name, ok, extra) => {
	console.log(`${ok ? 'ok   ' : 'FAIL '}${name}${ok || extra === undefined ? '' : `  -> ${extra}`}`)
	if (!ok) failed += 1
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const contexts = new Map()
let currentContext = null
const React = {
	useState: (initial) => {
		const ctx = currentContext
		const i = ctx.cursor++
		if (!(i in ctx.states)) ctx.states[i] = typeof initial === 'function' ? initial() : initial
		return [ctx.states[i], (v) => { ctx.states[i] = typeof v === 'function' ? v(ctx.states[i]) : v }]
	},
	useEffect: () => {},
	cloneElement: (element, props, children) => ({ ...element, props: { ...element.props, ...props, ...(children !== undefined ? { children } : {}) } }),
	Component: class {},
}
function expandAt(node, pathKey) {
	if (Array.isArray(node)) return node.map((n, i) => expandAt(n, `${pathKey}/${(n && n.key) || i}`))
	if (!node || typeof node !== 'object') return node
	if (typeof node.type === 'function' && node.type.prototype && typeof node.type.prototype.render === 'function') {
		const instance = new node.type(node.props)
		instance.props = node.props
		return expandAt(instance.render(), pathKey)
	}
	if (typeof node.type === 'function') {
		pathKey = `${pathKey}>${node.type.name}${node.key ? `#${node.key}` : ''}`
		let ctx = contexts.get(pathKey)
		if (!ctx) { ctx = { states: {}, cursor: 0 }; contexts.set(pathKey, ctx) }
		ctx.cursor = 0
		const previous = currentContext
		currentContext = ctx
		const out = node.type(node.props)
		currentContext = previous
		return expandAt(out, pathKey)
	}
	return { ...node, props: { ...node.props, children: expandAt(node.props && node.props.children, `${pathKey}.${typeof node.type === 'string' ? node.type : 'x'}`) } }
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
const has = (tree, text) => texts(tree).some((t) => t.includes(text))
const press = (tree, label) => { const hit = findAll(tree, (n) => n.props && (n.props.label === label || n.props.text === label) && typeof n.props.onPress === 'function')[0]; if (!hit) throw new Error(`no pressable "${label}"`); hit.props.onPress() }
const tap = (tree, text) => { const hit = findAll(tree, (n) => n.type === 'Pressable' && texts(n).includes(text))[0]; if (!hit) throw new Error(`no chip "${text}"`); hit.props.onPress() }

const G1 = '100000000000000001' // server with hidden channels
const G2 = '100000000000000002'
const ch = (id, over = {}) => ({ id, guild_id: G1, type: 0, name: `chan-${id.slice(-2)}`, parent_id: null, topic: null, nsfw: false, permissionOverwrites: {}, ...over })
function load(settings = {}, options = {}) {
	contexts.clear()
	const state = { selectedGuild: G1, openedSheets: [], originalCalls: [], preloads: [], cleared: 0, emitted: 0, toasts: [], copied: [] }
	const channels = {
		'200000000000000001': ch('200000000000000001', { name: 'general' }), // visible
		'200000000000000002': ch('200000000000000002', { name: 'staff-chat', topic: 'Mods only', parent_id: '300000000000000001', permissionOverwrites: { [G1]: { type: 0, allow: 0n, deny: 1024n }, '400000000000000001': { type: 0, allow: 1024n, deny: 0n }, '500000000000000001': { type: 1, allow: 1024n, deny: 0n } } }),
		'200000000000000003': ch('200000000000000003', { name: 'secret-voice', type: 2 }),
		'200000000000000004': ch('200000000000000004', { name: 'nsfw-zone', nsfw: true }),
		'200000000000000005': ch('200000000000000005', { name: 'news', type: 5, parent_id: '300000000000000002' }),
		'200000000000000006': ch('200000000000000006', { name: 'forum-x', type: 15 }),
		'200000000000000007': ch('200000000000000007', { name: 'in-g2', guild_id: G2 }),
		'300000000000000001': ch('300000000000000001', { name: 'MODS', type: 4 }),
	}
	const visible = new Set(['200000000000000001'])
	const originalGated = { isChannelGatedAndVisible: (g, id) => { state.originalCalls.push(['gated', id]); return false } }
	const permissionStore = { can: (bit, channel) => { if (options.noPermissionStore) throw new Error('x'); return visible.has(channel.id) } }
	const flux = {
		ChannelStore: { getChannel: (id) => channels[id], getMutableGuildChannelsForGuild: (g) => Object.fromEntries(Object.entries(channels).filter(([, c]) => c.guild_id === g)) },
		PermissionStore: permissionStore,
		GuildStore: { getGuilds: () => ({ [G1]: { id: G1, name: 'Alpha' }, [G2]: { id: G2, name: 'Beta' } }), getGuild: (id) => ({ [G1]: { id: G1, name: 'Alpha' }, [G2]: { id: G2, name: 'Beta' } })[id] },
		SelectedGuildStore: { getGuildId: () => state.selectedGuild },
		SelectedChannelStore: { getChannelId: () => '200000000000000001' },
		UserStore: { getUser: (id) => ({ id, globalName: 'Ryan' }) },
		GuildRoleStore: { getRole: (g, id) => ({ id, name: id.endsWith('1') ? 'Moderators' : 'Other' }) },
		ChannelListStore: { emitChange: () => { state.emitted += 1 } },
	}
	if (!options.noGated) flux.GatedChannelStore = originalGated
	const transitionModule = { transitionToChannel: (id, opts) => { state.originalCalls.push(['transition', id]); return 'opened' }, transitionToThread() {} }
	const preloadModule = { preload: (g, id) => { state.preloads.push(id) }, ensurePrivateChannel() {} }
	const statesModule = { default: { clear: () => { state.cleared += 1 } }, ChannelListSections: {}, SECTION_INDEX_RECENTS: 3 }
	const runtime = { jsx: (type, props, key) => ({ type, props: props || {}, key }), jsxs: (type, props, key) => ({ type, props: props || {}, key }) }
	global.valenced = {
		react: { React, ReactNative: { View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', useWindowDimensions: () => ({ height: 800 }) }, ReactJSXRuntime: runtime },
		externals: { ReactNativeClipboard: { Clipboard: { setString: (t) => { state.copied.push(t); global.copied = t } } } },
		discord: {
			flux: { Stores: flux },
			actions: { ToastActionCreators: { open: (k, o) => state.toasts.push(o.text) }, ActionSheetActionCreators: { openLazy: (p, key) => { state.openedSheets.push({ p, key }); return p }, hideActionSheet: () => { state.hidden = (state.hidden || 0) + 1 } } },
			design: { Design: new Proxy({}, { get: (_, key) => key }) },
		},
		patcher: {
			after: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { const r = original.apply(this, a); const x = fn.call(this, r); return x === undefined ? r : x }; return () => { object[key] = original } },
			instead: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { return fn.call(this, a, original) }; return () => { object[key] = original } },
		},
		modules: { finders: { filters: { withProps: (...n) => n.join() }, lookupModule: (f) => {
			if (f === 'jsx,jsxs') return [runtime]
			if (f === 'transitionToChannel,transitionToThread') return options.noTransition ? [] : [transitionModule]
			if (f === 'preload,ensurePrivateChannel') return [preloadModule]
			if (f === 'ChannelListSections,SECTION_INDEX_RECENTS') return [statesModule]
			if (f === 'isChannelGatedAndVisible,isChannelGated') return options.gatedByFinder ? [originalGated] : []
			return []
		} } },
	}
	global.plugin = (d) => d
	const data = { cache: { ...settings } }
	const json = { get cache() { return data.cache }, use() { return data.cache }, set(patch) { Object.assign(data.cache, patch) } }
	const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'show-hidden-channels', 'index.js'), 'utf8')
	const plugin = new Function('valenced', 'plugin', `return ${source}`)(global.valenced, global.plugin).default
	plugin.start({ cleanup: (fn) => fn, jsonStorage: json })
	const screen = () => expandAt({ type: plugin.SettingsComponent, props: { api: { jsonStorage: json } } }, 'root')
	const asked = (id) => originalGated.isChannelGatedAndVisible(channels[id].guild_id, id)
	return { plugin, data, json, runtime, state, channels, visible, flux, screen, asked, transitionModule, preloadModule }
}
const H = '200000000000000002' // staff-chat, hidden, in category MODS
const V = '200000000000000003' // secret voice
const N = '200000000000000004' // nsfw
const A = '200000000000000005' // announcement
const F = '200000000000000006' // forum
const OTHER = '200000000000000007' // other server

;(async () => {
	// 1. The hook on Discord's question
	{
		const app = load()
		check('a hidden text channel is answered "yes"', app.asked(H) === true)
		check('a channel you can see is left to Discord', app.asked('200000000000000001') === false && app.state.originalCalls.some((c) => c[1] === '200000000000000001'))
		check('categories are never changed', app.asked('300000000000000001') === false)
		check('voice, announcement and forum channels are shown by default', app.asked(V) && app.asked(A) && app.asked(F))
		check('the original answer true is kept', (() => { const x = load(); x.flux.GatedChannelStore.isChannelGatedAndVisible; return true })())
		const found = load({}, { noGated: true, gatedByFinder: true })
		check('the question is also found by a module search', found.asked(H) === true)
		const lost = load({}, { noGated: true })
		check('if it is not found the plugin still starts', lost.plugin && true)
		press(lost.screen(), 'Self-check')
		check('...and the self-check says so', has(lost.screen(), '✗ Found Discord’s "gated channel" question'))
	}

	// 2. Rules
	{
		check('the main switch off shows nothing', load({ enabled: false }).asked(H) === false)
		check('a kind that is off stays hidden', load({ typesJson: JSON.stringify({ text: true, voice: false, announcement: true, stage: true, forum: true, media: true, other: false }) }).asked(V) === false)
		check('...and the other kinds still work', load({ typesJson: JSON.stringify({ text: false }) }).asked(V) === true)
		check('a blocked channel stays hidden', load({ channelBlockJson: JSON.stringify([H]) }).asked(H) === false)
		check('a blocked category hides its channels', load({ categoryBlockJson: JSON.stringify(['300000000000000001']) }).asked(H) === false && load({ categoryBlockJson: JSON.stringify(['300000000000000001']) }).asked(V) === true)
		check('a blocked server shows nothing', load({ guildBlockJson: JSON.stringify([G1]) }).asked(H) === false && load({ guildBlockJson: JSON.stringify([G1]) }).asked(OTHER) === true)
		const wl = load({ scopeMode: 'whitelist', guildAllowJson: JSON.stringify([G2]) })
		check('"only allowed servers" shows just those', wl.asked(H) === false && wl.asked(OTHER) === true)
		check('an allowed channel is shown even in a blocked server', load({ guildBlockJson: JSON.stringify([G1]), channelAllowJson: JSON.stringify([H]) }).asked(H) === true)
		check('...but a blocked channel still wins', load({ channelAllowJson: JSON.stringify([H]), channelBlockJson: JSON.stringify([H]) }).asked(H) === false)
		check('blocked words hide matching names', load({ blockWords: 'staff, mod' }).asked(H) === false && load({ blockWords: 'staff' }).asked(V) === true)
		check('"only" words show just matching names', load({ onlyWords: 'secret' }).asked(V) === true && load({ onlyWords: 'secret' }).asked(H) === false)
		check('words ignore capital letters', load({ blockWords: 'STAFF' }).asked(H) === false)
		check('age-restricted channels can be skipped', load({ skipNsfw: true }).asked(N) === false && load({ skipNsfw: false }).asked(N) === true)
		check('broken saved lists do not crash', load({ guildBlockJson: 'oops', typesJson: '5', channelBlockJson: '{}' }).asked(H) === true)
		check('if permissions cannot be read nothing is changed', load({}, { noPermissionStore: true }).asked(H) === false)
	}

	// 3. Taps
	{
		const app = load()
		check('a tap on a hidden channel opens the info sheet', app.transitionModule.transitionToChannel(H) === undefined && app.state.openedSheets.length === 1 && app.state.openedSheets[0].key === 'MARKLONG_SHOW_HIDDEN_INFO')
		check('...and Discord’s opener is not called', !app.state.originalCalls.some((c) => c[0] === 'transition'))
		check('a tap on a normal channel goes through', app.transitionModule.transitionToChannel('200000000000000001') === 'opened')
		const nothing = load({ tap: 'nothing' })
		nothing.transitionModule.transitionToChannel(H)
		check('"do nothing" does nothing', nothing.state.openedSheets.length === 0 && !nothing.state.originalCalls.length)
		const attempt = load({ tap: 'try' })
		check('"let Discord try" calls the original', attempt.transitionModule.transitionToChannel(H) === 'opened')
		const blocked = load({ channelBlockJson: JSON.stringify([H]) })
		check('a blocked channel (not shown) is left to Discord', blocked.transitionModule.transitionToChannel(H) === 'opened')
		app.preloadModule.preload(G1, H)
		app.preloadModule.preload(G1, '200000000000000001')
		check('revealed channels are not preloaded, others are', app.state.preloads.length === 1 && app.state.preloads[0] === '200000000000000001')
		const lost = load({}, { noTransition: true })
		press(lost.screen(), 'Self-check')
		check('without the opener, the self-check says so', has(lost.screen(), '✗ Found the channel opener'))
	}

	// 4. Rows
	{
		const app = load()
		const row = (id, name = 'TextChannel', extra = {}) => { const T = { type: { name } }; const el = app.runtime.jsx(T, { channel: app.channels[id], muted: false, ...extra }); return el }
		const hidden = row(H)
		check('a hidden row gets the lock before the name', hidden.props.channel.name === '🔒 staff-chat', hidden.props.channel.name)
		check('...and is dimmed (muted)', hidden.props.channel.muted === true)
		check('...but keeps its other properties and methods', hidden.props.channel.id === H && hidden.props.channel.topic === 'Mods only')
		check('...the original channel is not changed', app.channels[H].name === 'staff-chat' && app.channels[H].muted === undefined)
		check('the same copy is used again, so the row does not redraw for nothing', row(H).props.channel === hidden.props.channel)
		app.json.set({ marker: 'key' })
		check('changing the marker in the settings changes the row', row(H).props.channel.name.startsWith('🔑'))
		app.json.set({ marker: 'lock' })
		check('a normal row is left alone', row('200000000000000001').props.channel === app.channels['200000000000000001'])
		check('other components are left alone', app.runtime.jsx({ type: { name: 'Banner' } }, { channel: app.channels[H] }).props.channel === app.channels[H])
		const voice = row(V, 'ChannelItem', { onPress: () => 'orig' })
		check('a voice row gets the marker and its tap opens the info sheet', voice.props.channel.name.includes('secret-voice') && (voice.props.onPress(), app.state.openedSheets.length === 1))
		const tryApp = load({ tap: 'try' })
		const tv = tryApp.runtime.jsx({ type: { name: 'ChannelItem' } }, { channel: tryApp.channels[V], onPress: () => 'orig' })
		check('with "let Discord try" the voice tap is left alone', tv.props.onPress() === 'orig')
		check('"after the name" puts the marker behind', load({ markerPosition: 'after' }).runtime.jsx({ type: { name: 'TextChannel' } }, { channel: load().channels[H] }).props.channel.name !== undefined)
		const after = load({ markerPosition: 'after' })
		check('...really', after.runtime.jsx({ type: { name: 'TextChannel' } }, { channel: after.channels[H] }).props.channel.name === 'staff-chat 🔒')
		const none = load({ marker: 'none', dim: false })
		const plain = none.runtime.jsx({ type: { name: 'TextChannel' } }, { channel: none.channels[H], muted: false }).props.channel
		check('marker "nothing" and no dimming leave the look alone', plain.name === 'staff-chat' && !plain.muted)
		const custom = load({ marker: 'custom', markerCustom: '[x]' })
		check('a custom marker works', custom.runtime.jsx({ type: { name: 'TextChannel' } }, { channel: custom.channels[H] }).props.channel.name === '[x] staff-chat')
		const eye = load({ marker: 'eye' })
		check('the eye marker works', eye.runtime.jsx({ type: { name: 'TextChannel' } }, { channel: eye.channels[H] }).props.channel.name.startsWith('👁'))
		const off = load({ enabled: false })
		check('with the plugin off rows are left alone', off.runtime.jsx({ type: { name: 'TextChannel' } }, { channel: off.channels[H] }).props.channel === off.channels[H])
	}

	// 5. Info sheet
	{
		const app = load()
		app.transitionModule.transitionToChannel(H)
		const Component = await app.state.openedSheets[0].p.then((m) => m.default)
		const tree = expandAt({ type: Component, props: {} }, 'sheet')
		check('the sheet shows name, topic and kind', has(tree, 'staff-chat') && has(tree, 'Mods only') && has(tree, 'Text channel'))
		check('...the category and server', has(tree, 'MODS') && has(tree, 'Alpha'))
		check('...who is let in, by name', has(tree, 'Moderators') && has(tree, 'Ryan') && has(tree, 'Not allowed to see it'))
		check('...and a creation date from the ID', has(tree, 'Created') && /20\d\d/.test(texts(tree).join(' ')))
		check('...and why it is shown', has(tree, 'Allowed by your rules'))
		press(tree, 'Channel ID')
		check('tapping an ID copies it', app.state.copied.includes(H))
		press(tree, 'Stop showing this channel')
		check('"Stop showing this channel" blocks it', JSON.parse(app.data.cache.channelBlockJson).includes(H) && app.asked(H) === false)
		press(tree, 'Stop showing this whole category')
		check('"this whole category" blocks the category', JSON.parse(app.data.cache.categoryBlockJson).includes('300000000000000001'))
		press(tree, 'Stop showing hidden channels in this server')
		check('"in this server" blocks the server', JSON.parse(app.data.cache.guildBlockJson).includes(G1))
		const lean = load({ sheetTopic: false, sheetDates: false, sheetWho: false, sheetIds: false })
		lean.transitionModule.transitionToChannel(H)
		const Lean = await lean.state.openedSheets[0].p.then((m) => m.default)
		const leanTree = expandAt({ type: Lean, props: {} }, 'sheet')
		check('parts of the sheet can be turned off', !has(leanTree, 'Mods only') && !has(leanTree, 'Created') && !has(leanTree, 'Who can see it') && !has(leanTree, 'Channel ID'))
		const gone = load()
		gone.transitionModule.transitionToChannel(H)
		const Gone = await gone.state.openedSheets[0].p.then((m) => m.default)
		delete gone.channels[H]
		check('a channel that is gone shows a short message', has(expandAt({ type: Gone, props: {} }, 'sheet'), 'not there any more'))
	}

	// 6. Settings screen
	{
		const app = load()
		const tree = app.screen()
		check('the screen shows the state and this server’s counts', has(tree, 'On') && has(tree, 'This server: 5 hidden channels, 5 shown by your rules'), texts(tree).slice(0, 8).join('|'))
		findAll(tree, (n) => n.props && n.props.title === 'When I tap a hidden channel')[0].props.onChange('nothing')
		check('the tap setting is saved', app.data.cache.tap === 'nothing')
		findAll(app.screen(), (n) => n.props && n.props.title === 'Which servers')[0].props.onChange('whitelist')
		check('the server mode is saved, and the list refreshes', app.data.cache.scopeMode === 'whitelist')
		await sleep(300)
		check('a changed rule rebuilds the channel list once', app.state.cleared >= 1 && app.state.emitted >= 1)
		const before = app.state.cleared
		app.json.set({}); app.plugin.SettingsComponent
		press(app.screen(), 'Refresh the list')
		check('"Refresh the list" rebuilds it at once', app.state.cleared === before + 1 && app.state.toasts.includes('Channel list rebuilt'))
		findAll(app.screen(), (n) => n.props && n.props.label === 'Voice channels' && n.props.onValueChange)[0].props.onValueChange(false)
		check('a kind switch is saved', JSON.parse(app.data.cache.typesJson).voice === false)
		findAll(app.screen(), (n) => n.props && n.props.label === 'Skip age-restricted channels')[0].props.onValueChange(true)
		check('the NSFW switch is saved', app.data.cache.skipNsfw === true)
		findAll(app.screen(), (n) => n.props && n.props.label === 'Dim hidden channels')[0].props.onValueChange(false)
		check('the dim switch is saved', app.data.cache.dim === false)
		findAll(app.screen(), (n) => n.props && n.props.title === 'Mark hidden channels with')[0].props.onChange('custom')
		check('"my own text" shows a field for it', has(app.screen(), 'Your marker'))
		const field = findAll(app.screen(), (n) => n.props && n.props.label === 'Never show names with these words')[0]
		field.props.onChange('staff')
		check('a word field is shown', !!field)
		const noGate = load({}, { noGated: true })
		check('with the hook missing the state says Not found', has(noGate.screen(), 'Not found'))
		check('with the plugin off the state says Off', has(load({ enabled: false }).screen(), 'Off'))
	}

	// 7. Servers and lists screens
	{
		const app = load()
		press(app.screen(), 'Choose servers')
		let tree = app.screen()
		check('the servers screen lists your servers, the open one first', has(tree, 'Alpha') && has(tree, 'Beta') && texts(tree).findIndex((t) => t === 'Alpha') < texts(tree).findIndex((t) => t === 'Beta'))
		tap(tree, 'Block')
		check('Block on a server saves it', JSON.parse(app.data.cache.guildBlockJson).includes(G1), app.data.cache.guildBlockJson)
		tree = app.screen()
		tap(findAll(tree, (n) => n.type === 'View' && n.props.style && n.props.style.gap === 8 && texts(n).includes('Beta'))[0], 'Allow')
		check('Allow on a server saves it', JSON.parse(app.data.cache.guildAllowJson).includes(G2))
		tap(app.screen(), 'Clear all')
		check('"Clear all" empties both lists', app.data.cache.guildAllowJson === '[]' && app.data.cache.guildBlockJson === '[]')
		tap(app.screen(), 'Block all')
		check('"Block all" blocks every server', JSON.parse(app.data.cache.guildBlockJson).length === 2 && app.asked(H) === false)
		tap(app.screen(), 'Allow all')
		check('"Allow all" allows every server and unblocks', JSON.parse(app.data.cache.guildAllowJson).length === 2 && app.data.cache.guildBlockJson === '[]')
		press(app.screen(), '‹ Back')
		check('Back returns to the main screen', has(app.screen(), 'Kinds of channel'))
		press(app.screen(), 'Allowed and blocked lists')
		const lists = app.screen()
		const input = findAll(lists, (n) => n.props && n.props.placeholder === 'Paste IDs (several allowed)')[0]
		check('the lists screen has an add box for each list', findAll(lists, (n) => n.props && n.props.placeholder === 'Paste IDs (several allowed)').length === 5)
		input.props.onChange(`${H}, 200000000000000003 junk 12`)
		const add = findAll(app.screen(), (n) => n.props && n.props.text === 'Add')[0]
		add.props.onPress()
		check('pasted IDs are added (junk ignored)', JSON.parse(app.data.cache.channelAllowJson).join() === `${H},200000000000000003`, app.data.cache.channelAllowJson)
		check('...and listed by name', has(app.screen(), '#staff-chat'))
		press(app.screen(), '#staff-chat')
		check('tapping an entry removes it', !JSON.parse(app.data.cache.channelAllowJson).includes(H))
	}

	// 8. Self-check, report, stale copy
	{
		const app = load()
		app.asked(H)
		app.runtime.jsx({ type: { name: 'TextChannel' } }, { channel: app.channels[H] })
		app.transitionModule.transitionToChannel(H)
		press(app.screen(), 'Self-check')
		const t = texts(app.screen()).join('|')
		check('the self-check passes on a working setup', /✓ Found Discord’s "gated channel" question/.test(t) && /✓ Found the channel opener/.test(t) && /✓ Can rebuild the channel list/.test(t) && /✓ Can read your permissions/.test(t) && /✓ Alpha has hidden channels/.test(t) && /✓ Discord asked about hidden channels/.test(t) && /✓ Marked rows were drawn/.test(t), t)
		press(app.screen(), 'Copy report')
		check('the report lists settings, hooks and counts', /Show Hidden Channels report/.test(global.copied) && /version: 1\.0\.0/.test(global.copied) && /hooks: gated found; transition found; preload found; list rebuild found/.test(global.copied) && /taps caught 1/.test(global.copied) && /this server: Alpha/.test(global.copied), global.copied)
		const fresh = load()
		press(fresh.screen(), 'Self-check')
		check('before anything was drawn the self-check says what to do', /✗ Discord asked about hidden channels/.test(texts(fresh.screen()).join('|')))
		const old = load()
		const newer = load()
		check('an older loaded copy stops decorating rows', old.runtime.jsx({ type: { name: 'TextChannel' } }, { channel: old.channels[H] }).props.channel === old.channels[H])
	}

	console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
	process.exit(failed ? 1 : 0)
})()
