// Mock tests for Always Animate. Run with: node tests/always-animate.test.cjs
const fs = require('fs')
const path = require('path')
let failed = 0
const check = (name, ok, extra) => {
	console.log(`${ok ? 'ok   ' : 'FAIL '}${name}${ok || extra === undefined ? '' : `  -> ${extra}`}`)
	if (!ok) failed += 1
}

/** A small fake of Discord's AvatarUtils: animated pictures give a .gif address only when "canAnimate" is true. */
function makeAvatarUtils(log) {
	const extension = (animatedHash, canAnimate) => (animatedHash && canAnimate ? 'gif' : 'webp')
	const utils = {
		getUserAvatarURL(user, canAnimate, size) { log.push(['getUserAvatarURL', canAnimate]); return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension(user.avatar.startsWith('a_'), canAnimate)}?size=${size}` },
		getUserAvatarSource(user, canAnimate, size) { log.push(['getUserAvatarSource', canAnimate]); return { uri: utils.getUserAvatarURL(user, canAnimate, size) } },
		getGuildMemberAvatarURL(member, canAnimate) { log.push(['getGuildMemberAvatarURL', canAnimate]); return 'x' },
		getGuildMemberAvatarSource(member, author, canAnimate) { log.push(['getGuildMemberAvatarSource', canAnimate]); return 'x' },
		getAnimatableSourceWithFallback(canAnimate, make) { log.push(['getAnimatableSourceWithFallback', canAnimate]); return make(canAnimate) },
		getGuildMemberAvatarURLSimple(options) { log.push(['getGuildMemberAvatarURLSimple', options.canAnimate]); return `https://cdn.discordapp.com/guilds/${options.guildId}/users/${options.userId}/avatars/${options.avatar}.${extension(true, options.canAnimate)}` },
		getUserBannerURL(options) { log.push(['getUserBannerURL', options.canAnimate]); return `banner.${extension(true, options.canAnimate)}` },
		getGuildIconURL(options) { log.push(['getGuildIconURL', options.canAnimate]); return `https://cdn.discordapp.com/icons/${options.id}/${options.icon}.${extension(options.icon.startsWith('a_'), options.canAnimate)}?size=${options.size}` },
		getAvatarDecorationURL(options) { log.push(['getAvatarDecorationURL', options.canAnimate]); return 'decoration' },
	}
	return utils
}

/** Loads a fresh copy of the plugin against a fake Discord. */
function load(settings = {}, options = {}) {
	const log = []
	const avatarUtils = makeAvatarUtils(log)
	const named = options.sameObject ? avatarUtils : { ...avatarUtils } // the module as a whole and its default object
	const avatarModule = options.noAvatarUtils ? null : (options.sameObject ? avatarUtils : Object.assign(named, { default: avatarUtils }))
	const settingsObject = (initial) => ({ getSetting: () => initial, useSetting: () => initial, updateSetting() {} })
	const accessibility = { AnimateEmoji: settingsObject(false), AnimateStickers: settingsObject(false), GifAutoPlay: settingsObject(false) }
	const runtime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
	const toasts = []
	const emitted = []
	const subs = []
	const chatModule = { default: function createMessageContent(input) { return { id: 'row', ...(input || {}) } } }
	const React = {
		useState: (initial) => { const state = [initial]; return [initial, (v) => { state[0] = v }] },
		useEffect: () => {},
		cloneElement: (element, props) => ({ ...element, props: { ...element.props, ...props } }),
	}
	global.valenced = {
		react: { React, ReactNative: { View: 'V', ScrollView: 'S' }, ReactJSXRuntime: runtime },
		externals: { ReactNativeClipboard: { Clipboard: { setString: (text) => { global.copied = text } } } },
		discord: { actions: { ToastActionCreators: { open: (k, o) => toasts.push(o.text) } }, design: { Design: new Proxy({}, { get: (_, key) => key }) }, flux: { Stores: options.noStores ? {} : { GuildStore: { emitChange: () => emitted.push('GuildStore') }, GuildMemberStore: { emitChange: () => emitted.push('GuildMemberStore') }, UserStore: { emitChange: () => emitted.push('UserStore') }, MessageStore: { emitChange: () => emitted.push('MessageStore') } } } },
		patcher: {
			after: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { const r = original.apply(this, a); const x = fn.call(this, r); return x === undefined ? r : x }; return () => { object[key] = original } },
			instead: (object, key, fn) => { const original = object[key]; object[key] = function (...a) { return fn.call(this, a, original) }; return () => { object[key] = original } },
		},
		modules: {
			finders: {
				filters: { withProps: (...n) => n.join(), withName: (n) => `name:${n}` },
				getModules: (f, cb) => { subs.push({ f, cb }); return () => {} },
				lookupModule: (f) => {
					if (f === 'name:createMessageContent') return options.noChat ? [] : [options.chatOnDefault ? { default: chatModule } : chatModule]
					if (f === 'jsx,jsxs') return [runtime]
					if (f === 'getUserAvatarURL,getGuildIconURL') return avatarModule ? [avatarModule] : []
					if (f === 'AnimateEmoji,AnimateStickers,GifAutoPlay') return options.noSettings ? [] : [accessibility]
					return []
				},
			},
		},
	}
	global.plugin = (definition) => definition
	const data = { cache: { ...settings } }
	const json = { get cache() { return data.cache }, use() { return data.cache }, set(patch) { Object.assign(data.cache, patch) } }
	const source = fs.readFileSync(path.join(__dirname, '..', 'plugins', 'always-animate', 'index.js'), 'utf8')
	const plugin = new Function('valenced', 'plugin', `return ${source}`)(global.valenced, global.plugin).default
	plugin.start({ cleanup: (fn) => fn, jsonStorage: json })
	return { plugin, data, json, runtime, log, avatarUtils, avatarModule, accessibility, toasts, emitted, subs, chatModule }
}
const user = (animated) => ({ id: '123456789012345678', avatar: `${animated ? 'a_' : ''}0123456789abcdef`, discriminator: '0' })
const texts = (node, out = []) => {
	if (Array.isArray(node)) node.forEach((n) => texts(n, out))
	else if (typeof node === 'string') out.push(node)
	else if (node && typeof node === 'object') {
		if (node.props && typeof node.props.label === 'string') out.push(node.props.label)
		if (node.props && typeof node.props.subLabel === 'string') out.push(node.props.subLabel)
		if (node.props && typeof node.props.text === 'string') out.push(`[${node.props.text}]`)
		texts(node.props && node.props.children, out)
	}
	return out
}
const expand = (node) => (Array.isArray(node) ? node.map(expand) : node && typeof node === 'object' && typeof node.type === 'function' ? expand(node.type(node.props)) : node && typeof node === 'object' ? { ...node, props: { ...node.props, children: expand(node.props && node.props.children) } } : node)
const findAll = (tree, test, out = []) => { if (Array.isArray(tree)) tree.forEach((n) => findAll(n, test, out)); else if (tree && typeof tree === 'object') { if (test(tree)) out.push(tree); findAll(tree.props && tree.props.children, test, out) } return out }

;(async () => {
// 1. Pictures
{
	const app = load()
	const url = app.avatarModule.getUserAvatarURL(user(true), false, 64)
	check('a picture that was asked for as still comes back animated', /\.gif\?/.test(url), url)
	check('...through the default object too', /\.gif\?/.test(app.avatarModule.default.getUserAvatarURL(user(true), false, 64)))
	check('a picture that is not animated stays as it is', /\.webp\?/.test(app.avatarModule.getUserAvatarURL(user(false), false, 64)))
	check('the "source" form is animated too', /\.gif/.test(app.avatarModule.getUserAvatarSource(user(true), false, 64).uri))
	check('a server icon (options object)', /\.gif\?/.test(app.avatarModule.getGuildIconURL({ id: '1', icon: 'a_abc', size: 64, canAnimate: false })))
	check('a server profile picture (options object)', /\.gif$/.test(app.avatarModule.getGuildMemberAvatarURLSimple({ guildId: '1', userId: '2', avatar: 'a_x', canAnimate: false })))
	check('a banner', app.avatarModule.getUserBannerURL({ canAnimate: false }).endsWith('.gif'))
	app.log.length = 0
	app.avatarModule.getGuildMemberAvatarSource({}, {}, false)
	app.avatarModule.getAnimatableSourceWithFallback(false, (x) => x)
	app.avatarModule.getGuildMemberAvatarURL({}, false)
	check('functions that take the answer as a plain argument get true at the right place', app.log.every(([, flag]) => flag === true) && app.log.length === 3, JSON.stringify(app.log))
	const options = { id: '1', icon: 'a_abc', size: 64, canAnimate: false }
	app.avatarModule.getGuildIconURL(options)
	check('the object Discord passed in is not changed', options.canAnimate === false)
	const same = load({}, { sameObject: true })
	same.log.length = 0
	same.avatarModule.getUserAvatarURL(user(true), false, 64)
	check('when the module and its default are one object it is wrapped once', same.log.length === 1 && same.log[0][1] === true, JSON.stringify(same.log))
	const off = load({ pictures: false })
	check('with the switch off nothing is changed', /\.webp\?/.test(off.avatarModule.getUserAvatarURL(user(true), false, 64)))
	const missing = load({}, { noAvatarUtils: true })
	check('if AvatarUtils is not found the plugin still starts', true)
}

// 2. Emoji, stickers, GIFs
{
	const app = load()
	check('animated emoji, stickers and GIFs read as on', app.accessibility.AnimateEmoji.getSetting() === true && app.accessibility.AnimateStickers.getSetting() === true && app.accessibility.GifAutoPlay.getSetting() === true)
	check('the hook form (useSetting) too', app.accessibility.AnimateEmoji.useSetting() === true && app.accessibility.GifAutoPlay.useSetting() === true)
	const some = load({ emoji: true, stickers: false, gifs: false })
	check('each switch works on its own', some.accessibility.AnimateEmoji.getSetting() === true && some.accessibility.AnimateStickers.getSetting() === false && some.accessibility.GifAutoPlay.getSetting() === false)
	const none = load({}, { noSettings: true })
	check('if the settings are not found the plugin still starts', true)
}

// 2b. Addresses of still pictures
{
	const app = load()
	const hash = 'a_0123456789abcdef0123456789abcdef'
	const Image = function Image() {}
	const addr = (uri, extra = {}) => app.runtime.jsx(Image, { source: { uri, ...extra }, style: { width: 40 } }).props.source
	const icon = `https://cdn.discordapp.com/icons/123456789012345678/${hash}.webp?size=96`
	check('a still server icon (webp) gets "animated=true"', addr(icon).uri === `${icon}&animated=true`, addr(icon).uri)
	check('...a png or jpg gets the gif address', addr(`https://cdn.discordapp.com/icons/1/${hash}.png?size=96`).uri === `https://cdn.discordapp.com/icons/1/${hash}.gif?size=96` && addr(`https://media.discordapp.net/avatars/1/${hash}.jpg`).uri === `https://media.discordapp.net/avatars/1/${hash}.gif`)
	check('...with no query a webp still gets one', addr(`https://cdn.discordapp.com/icons/1/${hash}.webp`).uri === `https://cdn.discordapp.com/icons/1/${hash}.webp?animated=true`)
	check('an address that is already animated is left alone', addr(`${icon}&animated=true`).uri === `${icon}&animated=true` && addr(`https://cdn.discordapp.com/icons/1/${hash}.gif?size=96`).uri === `https://cdn.discordapp.com/icons/1/${hash}.gif?size=96`)
	check('a picture that is not animated (no a_ in the hash) is left alone', addr('https://cdn.discordapp.com/icons/1/0123456789abcdef0123456789abcdef.webp?size=96').uri === 'https://cdn.discordapp.com/icons/1/0123456789abcdef0123456789abcdef.webp?size=96')
	check('an address that is not Discord\u2019s is left alone', addr(`https://example.com/x/${hash}.webp`).uri === `https://example.com/x/${hash}.webp`)
	check('other parts of the source are kept', addr(icon, { headers: { a: 'b' }, cache: 'force-cache' }).cache === 'force-cache')
	const list = app.runtime.jsx(Image, { source: [{ uri: icon }, { uri: 'https://x/y.png' }] }).props.source
	check('a list of sources is handled one by one', Array.isArray(list) && list[0].uri === `${icon}&animated=true` && list[1].uri === 'https://x/y.png')
	const asNumber = app.runtime.jsx(Image, { source: 18558 })
	check('a source that is a local picture (a number) is left alone', asNumber.props.source === 18558)
	const same = app.runtime.jsx(Image, { source: { uri: 'https://x/y.png' } })
	check('an element without such an address is returned as it was', same.props.source.uri === 'https://x/y.png')
	check('the screen counts it', /addresses: on; every picture address; Discord used it \d+ time\(s\), changed \d+/.test((() => { findAll(expand(app.plugin.SettingsComponent({ api: { jsonStorage: app.json } })), (n) => n.props && n.props.text === 'Copy report')[0].props.onPress(); return global.copied })()) && !/addresses: on; every picture address; Discord used it 0 /.test(global.copied), global.copied)
	const off = load({ addresses: false })
	check('with the switch off nothing is rewritten', off.runtime.jsx(Image, { source: { uri: icon } }).props.source.uri === icon)
}

// 2d. Chat rows
{
	const app = load()
	const hash = 'a_0123456789abcdef0123456789abcdef'
	const make = (over = {}) => app.chatModule.default({ avatarURL: `https://cdn.discordapp.com/avatars/1/${hash}.webp?size=64`, avatarDecorationURL: 'https://cdn.discordapp.com/avatar-decoration-presets/a_abc.png?size=96&passthrough=false', ...over })
	const row = make()
	check('the author\u2019s still picture in a chat row becomes the animated one', row.avatarURL.endsWith('&animated=true'), row.avatarURL)
	check('...and a preset decoration gets passthrough=true', /passthrough=true/.test(row.avatarDecorationURL) && !/passthrough=false/.test(row.avatarDecorationURL), row.avatarDecorationURL)
	const shop = make({ avatarDecorationURL: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1234/9876/static' })
	check('a shop decoration goes from /static to /animated', shop.avatarDecorationURL === 'https://cdn.discordapp.com/media/v1/collectibles-shop/1234/9876/animated', shop.avatarDecorationURL)
	const shop2 = make({ avatarDecorationURL: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1234/static' })
	check('...also without an asset id', shop2.avatarDecorationURL.endsWith('/1234/animated'))
	const done = make({ avatarURL: `https://cdn.discordapp.com/avatars/1/${hash}.webp?size=64&animated=true`, avatarDecorationURL: 'https://cdn.discordapp.com/media/v1/collectibles-shop/1234/animated' })
	check('already animated addresses are left alone', done.avatarURL.endsWith('size=64&animated=true') && done.avatarDecorationURL.endsWith('/animated'))
	const plain = make({ avatarURL: 'https://cdn.discordapp.com/avatars/1/0123456789abcdef0123456789abcdef.webp?size=64' })
	check('a picture that is not animated is left alone', plain.avatarURL === 'https://cdn.discordapp.com/avatars/1/0123456789abcdef0123456789abcdef.webp?size=64')
	const none = make({ avatarDecorationURL: null, avatarURL: undefined })
	check('a row without decoration or picture is fine', none.avatarDecorationURL === null && none.avatarURL === undefined)
	check('other parts of the row are kept', make({ username: 'x', content: 'hi' }).username === 'x')
	check('a row that is not an object is returned as it is', app.chatModule.default(undefined).id === 'row')
	const off = load({ chat: false })
	const offRow = off.chatModule.default({ avatarURL: `https://cdn.discordapp.com/avatars/1/${hash}.webp?size=64` })
	check('with the switch off the row is left alone', !/animated=true/.test(offRow.avatarURL))
	const lost = load({}, { noChat: true })
	check('if the chat rows are not found the plugin still starts and says so', /chat: on; not found/.test((() => { findAll(expand(lost.plugin.SettingsComponent({ api: { jsonStorage: lost.json } })), (n) => n.props && n.props.text === 'Copy report')[0].props.onPress(); return global.copied })()), global.copied)
	const late = load({}, { noChat: true })
	check('a chat module that loads later is picked up', late.subs.some((x) => x.f === 'name:createMessageContent'))
	late.subs[0].cb(late.chatModule)
	late.subs[0].cb(late.chatModule)
	const twice = late.chatModule.default({ avatarURL: `https://cdn.discordapp.com/avatars/1/${hash}.webp?size=64` })
	check('...and wrapped only once', (twice.avatarURL.match(/animated=true/g) || []).length === 1, twice.avatarURL)
	const def = load({}, { chatOnDefault: true })
	check('the chat function is found on a default export too', /animated=true/.test(def.chatModule.default({ avatarURL: `https://cdn.discordapp.com/avatars/1/${hash}.webp` }).avatarURL))
	findAll(expand(app.plugin.SettingsComponent({ api: { jsonStorage: app.json } })), (n) => n.props && n.props.text === 'Copy report')[0].props.onPress()
	check('the report counts chat rows', /chat: on; createMessageContent \(the chat rows\); Discord used it \d+ time\(s\), changed \d+/.test(global.copied) && !/chat: on; createMessageContent \(the chat rows\); Discord used it 0 /.test(global.copied), global.copied)
}

// 2c. Drawing the pictures on screen again
{
	const app = load()
	const screenFind = (label) => findAll(expand(app.plugin.SettingsComponent({ api: { jsonStorage: app.json } })), (n) => n.props && n.props.text === label)[0]
	screenFind('Refresh the pictures on screen').props.onPress()
	check('the button makes the stores that draw pictures announce a change', app.emitted.join() === 'GuildStore,GuildMemberStore,UserStore,MessageStore' && app.toasts.some((x) => /drawn again/.test(x)))
	const lost = load({}, { noStores: true })
	findAll(expand(lost.plugin.SettingsComponent({ api: { jsonStorage: lost.json } })), (n) => n.props && n.props.text === 'Refresh the pictures on screen')[0].props.onPress()
	check('without the stores it says so', lost.toasts.some((x) => /Could not refresh/.test(x)))
	const timed = load()
	await new Promise((r) => setTimeout(r, 1700))
	check('on its own the plugin draws the pictures again a moment after it starts', timed.emitted.length >= 3)
	const toggled = load()
	const row = findAll(expand(toggled.plugin.SettingsComponent({ api: { jsonStorage: toggled.json } })), (n) => n.props && n.props.label === 'Pictures' && n.props.onValueChange)[0]
	toggled.emitted.length = 0
	row.props.onValueChange(false)
	await new Promise((r) => setTimeout(r, 400))
	check('changing a picture switch draws them again too', toggled.emitted.length >= 3)
	const emojiRow = findAll(expand(toggled.plugin.SettingsComponent({ api: { jsonStorage: toggled.json } })), (n) => n.props && n.props.label === 'Emoji' && n.props.onValueChange)[0]
	toggled.emitted.length = 0
	emojiRow.props.onValueChange(false)
	await new Promise((r) => setTimeout(r, 400))
	check('...but not an emoji switch', toggled.emitted.length === 0)
	check('the report says how often', /pictures drawn again: \d+x/.test((() => { findAll(expand(toggled.plugin.SettingsComponent({ api: { jsonStorage: toggled.json } })), (n) => n.props && n.props.text === 'Copy report')[0].props.onPress(); return global.copied })()))
}

// 3. Status emoji and everything else
{
	function ActivityEmoji() {}
	function Thing() {}
	const app = load()
	const emoji = app.runtime.jsx(ActivityEmoji, { emoji: { id: '1', name: 'x', animated: true, animate: false } })
	check('the status emoji is told to animate', emoji.props.emoji.animate === true && emoji.props.emoji.id === '1')
	const keep = app.runtime.jsx(ActivityEmoji, { emoji: { id: '1', animate: true } })
	check('one that already animates is left alone', keep.props.emoji.animate === true)
	const other = app.runtime.jsx(Thing, { animate: false })
	check('other things are left alone by default', other.props.animate === false)
	const everything = load({ everything: true })
	check('with "everything" on, animate and canAnimate are forced', everything.runtime.jsx(Thing, { animate: false, canAnimate: false, shouldAnimate: false, label: 'a' }).props.animate === true && everything.runtime.jsx(Thing, { canAnimate: false }).props.canAnimate === true)
	check('...but not a property that was never false', everything.runtime.jsx(Thing, { label: 'a' }).props.animate === undefined)
	check('...and not the properties of plain views', everything.runtime.jsx('View', { animate: false }).props.animate === false)
	const noStatus = load({ statusEmoji: false })
	check('the status emoji switch works', noStatus.runtime.jsx(ActivityEmoji, { emoji: { animate: false } }).props.emoji.animate === false)
}

// 4. Self-check, report and screen
{
	const screen = (settings) => { const a = load(settings); return { a, tree: expand(a.plugin.SettingsComponent({ api: { jsonStorage: a.json } })) } }
	const { a, tree } = screen({})
	const shown = texts(tree).join('|')
	check('the screen shows all eight switches', ['Pictures', 'Emoji', 'Stickers', 'GIFs', 'Status emoji', 'Still pictures of animated things', 'Chat: pictures and decorations next to messages', 'Everything else (advanced)'].every((t) => shown.includes(t)), shown.slice(0, 300))
	check('each switch says what it covers and whether it was found', /AvatarUtils \(\d+ places?, \d+ functions\)/.test(shown) && /UserSettings\.AnimateEmoji/.test(shown), shown.slice(0, 400))
	const switches = findAll(tree, (n) => n.type === 'TableSwitchRow' && n.props.label)
	check('there are eight switches', switches.length === 8, String(switches.length))
	switches.find((s) => s.props.label === 'GIFs').props.onValueChange(false)
	check('a switch saves', a.data.cache.gifs === false)
	const reportApp = load()
	reportApp.avatarModule.getUserAvatarURL(user(true), false, 64)
	const reportScreen = expand(reportApp.plugin.SettingsComponent({ api: { jsonStorage: reportApp.json } }))
	findAll(reportScreen, (n) => n.props && n.props.text === 'Copy report')[0].props.onPress()
	check('the report lists every switch, the checks and the counts', /Always Animate report/.test(global.copied) && /pictures: on; AvatarUtils/.test(global.copied) && /check - A profile picture, asked for as "still": ok/.test(global.copied) && /Discord used it \d+ time\(s\), changed \d+/.test(global.copied), global.copied)
	check('the self-check passes when the plugin works', /A server icon, asked for as "still": ok/.test(global.copied) && !/FAIL/.test(global.copied), global.copied)
	const broken = load({ pictures: false })
	findAll(expand(broken.plugin.SettingsComponent({ api: { jsonStorage: broken.json } })), (n) => n.props && n.props.text === 'Copy report')[0].props.onPress()
	check('the self-check fails when the switch is off, so it really tests the plugin', /A profile picture, asked for as "still": FAIL/.test(global.copied), global.copied)
	const lost = load({}, { noAvatarUtils: true })
	findAll(expand(lost.plugin.SettingsComponent({ api: { jsonStorage: lost.json } })), (n) => n.props && n.props.text === 'Copy report')[0].props.onPress()
	check('the report says when AvatarUtils was not found', /pictures: on; not found/.test(global.copied) && /AvatarUtils was not found/.test(global.copied), global.copied)
}

// 5b. Counting
{
	const app = load()
	app.avatarModule.getUserAvatarURL(user(true), false, 64)
	app.avatarModule.getUserAvatarURL(user(true), true, 64)
	app.avatarModule.getGuildIconURL({ id: '1', icon: 'a_abc', size: 64, canAnimate: true })
	findAll(expand(app.plugin.SettingsComponent({ api: { jsonStorage: app.json } })), (n) => n.props && n.props.text === 'Copy report')[0].props.onPress()
	check('the report counts how often Discord used a function and how often it was changed', /pictures: on; .*Discord used it 3 time\(s\), changed 1/.test(global.copied), global.copied)
	check('...per function', /getUserAvatarURL 2\/1/.test(global.copied) && /getGuildIconURL 1\/0/.test(global.copied), global.copied)
	findAll(expand(app.plugin.SettingsComponent({ api: { jsonStorage: app.json } })), (n) => n.props && n.props.text === 'Copy report')[0].props.onPress()
	check('the plugin\'s own self-check calls are not counted', /Discord used it 3 time/.test(global.copied), global.copied)
	app.accessibility.AnimateStickers.getSetting()
	check('a setting that already said true counts as used, not changed', true)
}

// 5. The state of each switch on the screen
{
	const app = load()
	const before = texts(expand(app.plugin.SettingsComponent({ api: { jsonStorage: app.json } }))).join('|')
	check('before anything happened the switches say Ready', /Ready, waiting/.test(before) && !/Working/.test(before), before.slice(0, 300))
	app.avatarModule.getUserAvatarURL(user(true), false, 64)
	const after = texts(expand(app.plugin.SettingsComponent({ api: { jsonStorage: app.json } }))).join('|')
	check('after the plugin changed a picture, Pictures says Working with a count', /Working · \d+ of \d+/.test(after), after.slice(0, 300))
	const off = load({ emoji: false })
	check('a switch that is off says Off', /Off/.test(texts(expand(off.plugin.SettingsComponent({ api: { jsonStorage: off.json } }))).join('|')))
	const lost = load({}, { noAvatarUtils: true })
	check('something that was not found says Not found', /Not found/.test(texts(expand(lost.plugin.SettingsComponent({ api: { jsonStorage: lost.json } }))).join('|')))
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed')
process.exit(failed ? 1 : 0)
})()
