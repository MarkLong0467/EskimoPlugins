// Mock tests for SoundCloud Presence and its hand-off to Rich Presence. Run with: node tests/soundcloud-presence.test.cjs
// Both real plugin files are loaded into one fake Discord, so the Last.fm -> SoundCloud Presence -> Rich Presence
// path runs end to end. The network is faked, so no account or key is needed.
const fs = require('fs')
const path = require('path')
let failed = 0
const check = (name, ok, extra) => {
	console.log(`${ok ? 'ok   ' : 'FAIL '}${name}${ok || extra === undefined ? '' : `  -> ${JSON.stringify(extra)}`}`)
	if (!ok) failed += 1
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const root = path.join(__dirname, '..', 'plugins')

// ---- A fake network --------------------------------------------------------------------------
const net = {
	recent: null, // what user.getrecenttracks returns
	info: { track: { duration: '200000' } },
	calls: [],
}
const reply = (body, status = 200, url) => ({ ok: status >= 200 && status < 300, status, url, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
globalThis.fetch = async (url) => {
	net.calls.push(url)
	const u = new URL(url)
	if (u.host === 'ws.audioscrobbler.com') {
		if (u.searchParams.get('api_key') !== 'KEY') return reply({ error: 10, message: 'Invalid API key - You must be granted a valid key by last.fm' }, 403)
		if (u.searchParams.get('method') === 'user.getrecenttracks') return reply(net.recent)
		if (u.searchParams.get('method') === 'track.getinfo') return reply(net.info)
	}
	if (u.host === 'soundcloud.com' && u.pathname === '/oembed')
		return reply({ title: 'Flickermood by Forss', author_name: 'Forss', author_url: 'https://soundcloud.com/forss', thumbnail_url: 'https://i1.sndcdn.com/artworks-1-t500x500.jpg' })
	if (u.host === 'soundcloud.com' && u.pathname === '/forss/flickermood')
		return reply('<link rel="canonical" href="https://soundcloud.com/forss/flickermood"><meta itemprop="duration" content="PT00H03M33S"/>"full_duration":213890', 200, 'https://soundcloud.com/forss/flickermood')
	return reply('not found', 404)
}

// ---- A fake Discord --------------------------------------------------------------------------
const dispatched = []
const toasts = []
const jsx = (t, p, k) => ({ t, p, k })
const Design = new Proxy({ createStyles: () => () => ({}) }, { get: (o, k) => (k in o ? o[k] : String(k)) })
globalThis.valenced = {
	discord: {
		common: { flux: { Dispatcher: { dispatch: (a) => dispatched.push(a) } }, tokens: { Tokens: { default: { colors: new Proxy({}, { get: () => '#000' }) } } } },
		actions: { ToastActionCreators: { open: (id, o) => toasts.push(o.text) } },
		design: { Design },
		flux: { onFluxEventDispatched: () => () => {}, Stores: { UserStore: { getCurrentUser: () => ({ username: 'chase', globalName: 'Chase' }) } } },
	},
	modules: {
		finders: {
			filters: { withProps: (...a) => a },
			lookupModule: (f) => (f[0] === 'HTTPResponseError' ? [{ post: async ({ body }) => ({ body: [{ external_asset_path: 'external/abc/' + body.urls[0].replace(/^https?:\/\//, 'https/') }] }) }] : []),
		},
	},
	react: { React: { useState: (v) => [v, () => {}], useEffect() {} }, ReactJSXRuntime: { jsx, jsxs: jsx }, ReactNative: { View: 'View', Image: 'Image', ScrollView: 'ScrollView', AppState: { addEventListener: () => ({ remove() {} }) } } },
	externals: { ReactNativeClipboard: { Clipboard: { getString: async () => '', setString() {} } } },
}
globalThis.plugin = (x) => x

function makeStore(initial) {
	const s = { cache: initial, set: async (v) => { s.cache = v }, get: async () => s.cache, use: () => s.cache }
	return s
}
function load(id, hook) {
	let src = fs.readFileSync(path.join(root, id, 'index.js'), 'utf8')
	if (hook) src = src.replace(/\r?\n\treturn exports\r?\n\}\)\(\{\}\)/, `\n\texports.__t = ${hook}\n\treturn exports\n})({})`)
	return (0, eval)(src)
}
/** Finds an element in a rendered tree by a prop value. */
function find(node, key, value) {
	if (!node || typeof node !== 'object') return null
	if (node.p && node.p[key] === value) return node
	const kids = node.p && node.p.children
	for (const k of Array.isArray(kids) ? kids : [kids]) {
		const hit = find(k, key, value)
		if (hit) return hit
	}
	return null
}
const lastFor = (socket) => [...dispatched].reverse().find((d) => d.socketId === socket)
const nowPlaying = (artist, name, image) => ({ recenttracks: { track: [{ artist: { '#text': artist }, name, image: image || [{ size: 'large', '#text': 'https://lastfm.example/i/u/300x300/art.jpg' }], '@attr': { nowplaying: 'true' } }] } })
const stopped = () => ({ recenttracks: { track: [{ artist: { '#text': 'Forss' }, name: 'Flickermood', date: { uts: '1' }, image: [] }] } })

;(async () => {
	const cleanups = []
	const sc = load('soundcloud-presence', '{ parseLink, lookup, poll, fetchNowPlaying, pickImage, effective, merge, read, SettingsComponent, getAuto: function () { return auto }, showTrack }')
	const rp = load('rich-presence')
	const T = sc.__t

	// -- Rich Presence: the preset button builds a SoundCloud profile
	const rpStore = makeStore(undefined)
	rp.default.start({ jsonStorage: rpStore, cleanup: (fn) => cleanups.push(fn) })
	await sleep(50)
	check('Rich Presence exposes a refresh hook to other plugins', typeof globalThis.eskimoRichPresence?.apply === 'function')
	const rpTree = (() => {
		// Rich Presence's own SettingsComponent is not exported by name; it is the one on the default export.
		return rp.default.SettingsComponent({ api: { jsonStorage: rpStore } })
	})()
	const presetRow = find(rpTree, 'label', 'Use for SoundCloud')
	check('Rich Presence settings have a "Use for SoundCloud" button', !!presetRow)
	presetRow.p.onPress()
	await sleep(50)
	const preset = rpStore.cache.profiles.find((p) => p.label === 'SoundCloud')
	check('the preset fills details, state, image, button and timer', preset && preset.details === '{sc_title}' && preset.state === '{sc_artist}' && preset.largeImage === '{sc_art}' && preset.timestampMode === 'external' && preset.button1Url === '{sc_url}' && preset.showOnlyWhen === '{sc_title}', preset)
	check('the new profile is the active one', rpStore.cache.activeProfile === preset.id)
	await sleep(400)
	const idle = lastFor('EskimoRichPresence')
	check('nothing playing: Rich Presence shows nothing (showOnlyWhen)', idle && idle.activity === null, idle)

	// -- SoundCloud Presence: automatic mode, handing the track to Rich Presence
	const scStore = makeStore({ autoEnabled: true, lfmUser: 'chase', lfmKey: 'KEY', output: 'rich', pollSeconds: '15' })
	sc.default.start({ jsonStorage: scStore, cleanup: (fn) => cleanups.push(fn) })
	await sleep(100)

	net.recent = nowPlaying('Forss', 'Flickermood')
	await T.poll()
	await sleep(500)
	const a = T.getAuto()
	check('Last.fm now playing becomes the current track', a && a.title === 'Flickermood' && a.artist === 'Forss' && a.duration === 200000, a)
	const act = lastFor('EskimoRichPresence').activity
	check('Rich Presence shows it as Listening to SoundCloud', act && act.name === 'SoundCloud' && act.type === 2 && act.details === 'Flickermood' && act.state === 'Forss', act)
	check('the large image is the Last.fm artwork', act && act.assets && /^mp:external\/abc\/https\/lastfm\.example/.test(act.assets.large_image), act && act.assets)
	check('the button searches SoundCloud for the song', act && act.buttons && act.buttons[0] === 'Find on SoundCloud' && act.metadata.button_urls[0] === 'https://soundcloud.com/search/sounds?q=Forss%20Flickermood', act && [act.buttons, act.metadata])
	check('the progress bar runs for the length of the track', act && act.timestamps && act.timestamps.end - act.timestamps.start === 200000, act && act.timestamps)
	check('SoundCloud Presence stays quiet itself in Rich Presence mode', lastFor('EskimoSoundCloudPresence').activity === null)

	const started = a.startedAt
	await sleep(20)
	await T.poll()
	check('the same song again keeps its start time', T.getAuto().startedAt === started)

	net.recent = nowPlaying('Other Artist', 'Another Song', [{ size: 'large', '#text': 'https://lastfm.example/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png' }])
	net.info = { track: { duration: '0' } }
	await T.poll()
	await sleep(500)
	check('a new song replaces the old one', T.getAuto().title === 'Another Song')
	const act2 = lastFor('EskimoRichPresence').activity
	check('Last.fm\'s blank star image is not used as artwork', act2 && !act2.assets, act2 && act2.assets)
	check('with no known length it counts time elapsed', act2 && act2.timestamps && act2.timestamps.start && !act2.timestamps.end, act2 && act2.timestamps)

	net.recent = stopped()
	await T.poll()
	await sleep(500)
	check('when Last.fm stops reporting, the track is dropped', T.getAuto() === null)
	check('and Rich Presence clears your status', lastFor('EskimoRichPresence').activity === null)

	// -- Errors
	await scStore.set({ ...scStore.cache, lfmKey: 'WRONG' }, true)
	await T.poll()
	check('a bad key is reported, not thrown', true)
	let failedTest = null
	try { await T.fetchNowPlaying() } catch (e) { failedTest = String(e.message) }
	check('the error says what Last.fm said', failedTest && /Invalid API key/.test(failedTest), failedTest)
	await scStore.set({ ...scStore.cache, lfmKey: '' }, true)
	failedTest = null
	try { await T.fetchNowPlaying() } catch (e) { failedTest = String(e.message) }
	check('a missing key asks for it', failedTest && /Enter your Last.fm name and API key/.test(failedTest), failedTest)

	// -- Own output mode
	await scStore.set({ ...scStore.cache, lfmKey: 'KEY', output: 'own' }, true)
	net.recent = nowPlaying('Forss', 'Flickermood')
	net.info = { track: { duration: '200000' } }
	await T.poll()
	await sleep(400)
	const own = lastFor('EskimoSoundCloudPresence').activity
	check('own mode: SoundCloud Presence sets the status itself', own && own.name === 'SoundCloud' && own.type === 2 && own.details === 'Flickermood' && own.state === 'Forss' && own.buttons[0] === 'Find on SoundCloud', own)
	check('own mode: Rich Presence is cleared', lastFor('EskimoRichPresence').activity === null)

	// -- A pasted link wins when nothing is playing, and automatic mode wins while something is
	net.recent = stopped()
	await T.poll()
	await T.showTrack('https://soundcloud.com/forss/flickermood')
	await sleep(100)
	const manual = lastFor('EskimoSoundCloudPresence').activity
	check('a pasted link shows with its real link, art and length', manual && manual.details === 'Flickermood' && manual.details_url === 'https://soundcloud.com/forss/flickermood' && manual.buttons[0] === 'Listen on SoundCloud' && manual.timestamps.end - manual.timestamps.start === 213890, manual)
	check('the pasted link is remembered in Recent', scStore.cache.recents.length === 1 && scStore.cache.current.title === 'Flickermood')

	// -- Settings screen
	const tree = T.SettingsComponent({ api: { jsonStorage: scStore } })
	check('settings render', tree && tree.t === 'ScrollView')
	const testRow = find(tree, 'label', 'Test Last.fm')
	check('settings have a Test Last.fm button', !!testRow)
	net.recent = nowPlaying('Forss', 'Flickermood')
	toasts.length = 0
	testRow.p.onPress()
	await sleep(100)
	check('Test Last.fm reports what is playing', toasts.some((t) => /Connected\. Now playing: Flickermood by Forss/.test(t)), toasts)

	// -- Clean up
	cleanups.forEach((fn) => fn())
	await sleep(50)
	check('stopping the plugins clears the status', lastFor('EskimoSoundCloudPresence').activity === null)
	check('and removes the Rich Presence hook', globalThis.eskimoRichPresence === undefined)

	console.log(failed ? `\n${failed} FAILED` : '\nall passed')
	process.exit(failed ? 1 : 0)
})().catch((e) => {
	console.error('CRASH', e)
	process.exit(2)
})
