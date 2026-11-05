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
	// A slow network: the extra lookups (track info, Apple Music) take net.delay milliseconds.
	if (net.delay && (u.host === 'itunes.apple.com' || (u.host === 'ws.audioscrobbler.com' && u.searchParams.get('method') === 'track.getinfo'))) await sleep(net.delay)
	if (net.hang && u.host === 'ws.audioscrobbler.com') return new Promise(() => {})
	if (u.host === 'ws.audioscrobbler.com') {
		if (u.searchParams.get('api_key') !== 'KEY') return reply({ error: 10, message: 'Invalid API key - You must be granted a valid key by last.fm' }, 403)
		if (u.searchParams.get('method') === 'user.getrecenttracks') return reply(net.recent)
		if (u.searchParams.get('method') === 'track.getinfo') return reply(net.info)
	}
	if (u.host === 'itunes.apple.com') return reply({ results: net.itunes || [] })
	if (u.host === 'soundcloud.com' && u.pathname === '/oembed')
		return reply({ title: 'Flickermood by Forss', author_name: 'Forss', author_url: 'https://soundcloud.com/forss', thumbnail_url: 'https://i1.sndcdn.com/artworks-1-t500x500.jpg' })
	if (u.host === 'soundcloud.com' && u.pathname === '/forss/flickermood')
		return reply('<link rel="canonical" href="https://soundcloud.com/forss/flickermood"><meta itemprop="duration" content="PT00H03M33S"/>"full_duration":213890', 200, 'https://soundcloud.com/forss/flickermood')
	return reply('not found', 404)
}

// ---- A fake Discord --------------------------------------------------------------------------
const dispatched = []
const toasts = []
const handlers = {} // Discord events the plugins subscribed to, so the tests can fire them
const jsx = (t, p, k) => ({ t, p, k })
const Design = new Proxy({ createStyles: () => () => ({}) }, { get: (o, k) => (k in o ? o[k] : String(k)) })
globalThis.valenced = {
	discord: {
		common: { flux: { Dispatcher: { dispatch: (a) => dispatched.push(a) } }, tokens: { Tokens: { default: { colors: new Proxy({}, { get: () => '#000' }) } } } },
		actions: { ToastActionCreators: { open: (id, o) => toasts.push(o.text) } },
		design: { Design },
		flux: {
			onFluxEventDispatched: (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); return () => {} },
			Stores: { UserStore: { getCurrentUser: () => ({ username: 'chase', globalName: 'Chase' }) } },
		},
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
	const sc = load('soundcloud-presence', '{ parseLink, lookup, poll, fetchNowPlaying, pickImage, effective, merge, read, apply, SettingsComponent, getAuto: function () { return auto }, showTrack, dispatchActivity, setRate: function (max, ms) { rateMax = max; rateWindow = ms }, setTimeoutMs: function (n) { requestTimeout = n }, setRecheck: function (n) { recheckMs = n } }')
	const rp = load('rich-presence')
	const T = sc.__t
	T.setRate(1000, 1) // no waiting between updates, except in the tests that check the waiting
	T.setRecheck(60)

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
	// The timer is recorded but never fires, so the tests decide exactly when Last.fm is checked.
	const intervals = []
	const realSetInterval = global.setInterval
	global.setInterval = (fn, ms) => { intervals.push(ms); return 0 }
	const scStore = makeStore({ autoEnabled: true, lfmUser: 'chase', lfmKey: 'KEY', output: 'rich', pollSeconds: '5' })
	sc.default.start({ jsonStorage: scStore, cleanup: (fn) => cleanups.push(fn) })
	await sleep(50)
	global.setInterval = realSetInterval
	check('Last.fm can be checked every 5 seconds', intervals.includes(5000), intervals)
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
	check('Last.fm\'s blank star image is not used as artwork', T.getAuto().artwork === '', T.getAuto())
	check('with no cover anywhere the SoundCloud default cover is shown, not an empty box', act2 && act2.assets && /raw\.githubusercontent\.com\/MarkLong0467\/EskimoPlugins\/main\/plugins\/soundcloud-presence\/cover\.png/.test(act2.assets.large_image), act2 && act2.assets)
	check('the default cover is also handed to Rich Presence as {sc_art}', /cover\.png$/.test(globalThis.eskimoVars.sc_art), globalThis.eskimoVars)
	check('the default cover file ships with the plugin', fs.existsSync(path.join(root, 'soundcloud-presence', 'cover.png')))
	check('with no known length it counts time elapsed', act2 && act2.timestamps && act2.timestamps.start && !act2.timestamps.end, act2 && act2.timestamps)

	// A single empty report between songs must not clear the status: it looks again first.
	net.recent = nowPlaying('Other Artist', 'Another Song')
	await T.poll()
	const keptStart = T.getAuto().startedAt
	net.recent = stopped()
	await T.poll()
	check('one empty Last.fm report does not drop the track yet', T.getAuto() !== null)
	net.recent = nowPlaying('Other Artist', 'Another Song')
	await sleep(250)
	check('and if it is playing again on the second look, nothing changes', T.getAuto() && T.getAuto().startedAt === keptStart)

	net.recent = stopped()
	await T.poll()
	await sleep(300)
	check('two empty reports in a row drop the track', T.getAuto() === null)
	await sleep(400)
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

	// -- Artwork and album fallbacks, small icon, autocorrect
	await scStore.set({ ...scStore.cache, output: 'own', smallIcon: 'https://example.com/sc.png' }, true)
	net.recent = nowPlaying('Album Artist', 'Album Song', [])
	net.info = { track: { duration: '180000', album: { title: 'Album X', image: [{ size: 'large', '#text': 'https://lastfm.example/i/u/300x300/album.jpg' }] } } }
	await T.poll()
	await sleep(300)
	const withAlbum = lastFor('EskimoSoundCloudPresence').activity
	check('with no recent-tracks art, the track\'s album art is used', T.getAuto().artwork === 'https://lastfm.example/i/u/300x300/album.jpg', T.getAuto())
	check('the hover text on the cover is the album', withAlbum && withAlbum.assets && withAlbum.assets.large_text === 'Album X', withAlbum && withAlbum.assets)
	check('the optional small icon is sent in the corner', withAlbum && withAlbum.assets && /^mp:/.test(withAlbum.assets.small_image) && withAlbum.assets.small_text === 'SoundCloud', withAlbum && withAlbum.assets)
	check('track info is asked with autocorrect on', net.calls.some((u) => /method=track\.getinfo/.test(u) && /autocorrect=1/.test(u)))

	// -- Covers Last.fm does not have
	const appleCalls = () => net.calls.filter((u) => /itunes\.apple\.com/.test(u)).length
	net.info = { track: { duration: '180000' } }
	net.itunes = [{ trackName: 'Song Z', artistName: 'Artist Z', artworkUrl100: 'https://is1.example/art/100x100bb.jpg' }]
	net.recent = nowPlaying('Artist Z', 'Song Z (Radio Edit)', [])
	await T.poll()
	await sleep(150) // the cover is looked up after the song is already shown
	check('Apple Music supplies the cover when Last.fm has none', T.getAuto().artwork === 'https://is1.example/art/600x600bb.jpg', T.getAuto())

	net.itunes = [{ trackName: 'Song Y', artistName: 'Somebody Different', artworkUrl100: 'https://is1.example/wrong/100x100bb.jpg' }]
	net.recent = nowPlaying('Artist Y', 'Song Y', [])
	await T.poll()
	await sleep(150)
	check('a result by a different artist is never used', T.getAuto().artwork === '', T.getAuto())

	net.itunes = [{ trackName: 'Song X', artistName: 'Artist X', artworkUrl100: 'https://is1.example/x/100x100bb.jpg' }]
	await scStore.set({ ...scStore.cache, coverLookup: false }, true)
	const appleBefore = appleCalls()
	net.recent = nowPlaying('Artist X', 'Song X', [])
	await T.poll()
	await sleep(150)
	check('with "Find missing covers" off, Apple is not asked', appleCalls() === appleBefore && T.getAuto().artwork === '', [appleBefore, appleCalls()])

	await scStore.set({ ...scStore.cache, fallbackCover: false }, true)
	await T.apply()
	await sleep(100)
	const bare = lastFor('EskimoSoundCloudPresence').activity
	check('with the default cover off and none found, no image is sent', bare && !bare.assets, bare)
	await scStore.set({ ...scStore.cache, coverLookup: true, fallbackCover: true }, true)

	// -- Hiding while Spotify is playing
	const stores = globalThis.valenced.discord.flux.Stores
	stores.LocalActivityStore = { getActivities: () => [{ type: 2, name: 'Spotify', application_id: '3201606009684' }] }
	handlers.SPOTIFY_PLAYER_STATE.forEach((fn) => fn({}))
	await sleep(1800)
	check('a Spotify event makes the status step aside', lastFor('EskimoSoundCloudPresence').activity === null)
	await scStore.set({ ...scStore.cache, hideWithSpotify: false }, true)
	await T.apply()
	await sleep(100)
	check('with "Hide while Spotify is playing" off, it still shows', lastFor('EskimoSoundCloudPresence').activity !== null)
	await scStore.set({ ...scStore.cache, hideWithSpotify: true }, true)
	stores.LocalActivityStore = { getActivities: () => [{ type: 2, name: 'SoundCloud', application_id: '0' }] }
	await T.apply()
	await sleep(100)
	check('its own activity does not hide itself', lastFor('EskimoSoundCloudPresence').activity !== null)
	stores.LocalActivityStore = { getActivities: () => [] }
	await T.apply()
	await sleep(100)
	check('with Spotify gone it shows again', lastFor('EskimoSoundCloudPresence').activity !== null)

	// -- Updates are spaced out and repeats are dropped (Discord allows 5 updates per 20 seconds)
	const countSc = () => dispatched.filter((d) => d.socketId === 'EskimoSoundCloudPresence').length
	T.setRate(1, 400)
	await sleep(450)
	let before = countSc()
	await T.apply(); await T.apply(); await T.apply()
	check('identical updates are not sent again', countSc() === before, [before, countSc()])
	net.info = { track: { duration: '180000' } }
	net.recent = nowPlaying('Burst Artist', 'Song A')
	await T.poll()
	net.recent = nowPlaying('Burst Artist', 'Song B')
	await T.poll()
	net.recent = nowPlaying('Burst Artist', 'Song C')
	await T.poll()
	const sentDuringBurst = countSc() - before
	check('a burst of three changes sends at most two updates at first', sentDuringBurst <= 1, sentDuringBurst)
	await sleep(700)
	const burstTotal = countSc() - before
	check('the burst becomes two updates in all, not three', burstTotal === 2, burstTotal)
	check('and the last one sent is the newest song', lastFor('EskimoSoundCloudPresence').activity.details === 'Song C', lastFor('EskimoSoundCloudPresence').activity)
	T.setRate(1000, 1)

	// -- Discord's limit is 5 updates per 20 seconds, so 4 are sent at once and only the newest one after that waits
	T.setRate(2, 600)
	await sleep(700)
	before = countSc()
	T.dispatchActivity({ name: 'rate-1' })
	T.dispatchActivity({ name: 'rate-2' })
	T.dispatchActivity({ name: 'rate-3' })
	check('updates inside the allowance are sent at once', countSc() === before + 2, [before, countSc()])
	T.dispatchActivity({ name: 'rate-3' })
	await sleep(750)
	check('the update over the allowance waits, then goes out', countSc() === before + 3 && lastFor('EskimoSoundCloudPresence').activity.name === 'rate-3', [before, countSc()])
	check('and an identical repeat of it is never sent', (T.dispatchActivity({ name: 'rate-3' }), countSc() === before + 3))
	T.setRate(1000, 1)

	// -- A song change shows up at once, before the extra lookups finish
	await scStore.set({ ...scStore.cache, output: 'own' }, true)
	net.delay = 300
	net.info = { track: { duration: '180000' } }
	net.itunes = []
	net.recent = nowPlaying('Fast Artist', 'Fast Song', [])
	const t0 = Date.now()
	await T.poll()
	const quickMs = Date.now() - t0
	const quick = lastFor('EskimoSoundCloudPresence').activity
	check('the new song is on the profile before the slow lookups return', quickMs < 250 && quick && quick.details === 'Fast Song', [quickMs, quick && quick.details])
	check('first it has no progress bar, because the length is not known yet', quick && quick.timestamps && !quick.timestamps.end, quick && quick.timestamps)
	await sleep(600)
	const filled = lastFor('EskimoSoundCloudPresence').activity
	check('then the length arrives and the progress bar appears', filled && filled.details === 'Fast Song' && filled.timestamps.end - filled.timestamps.start === 180000, filled && filled.timestamps)
	net.delay = 0

	// -- A request that never answers cannot block the next check
	T.setTimeoutMs(150)
	net.hang = true
	let hung = null
	const h0 = Date.now()
	try { await T.fetchNowPlaying() } catch (e) { hung = String(e.message) }
	check('a stuck Last.fm request gives up and says so', hung && /did not answer in time/.test(hung) && Date.now() - h0 < 1000, [hung, Date.now() - h0])
	await T.poll()
	net.hang = false
	T.setTimeoutMs(8000)
	net.recent = nowPlaying('After Hang', 'Works Again', [])
	await T.poll()
	await sleep(100)
	check('the next check works normally afterwards', T.getAuto() && T.getAuto().title === 'Works Again', T.getAuto())

	// -- Discord reconnecting drops local activities, so the last one is sent again
	before = countSc()
	handlers.CONNECTION_OPEN.forEach((fn) => fn({}))
	await sleep(3300)
	check('after Discord reconnects the status is sent again', countSc() === before + 1, [before, countSc()])

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

	check('the settings offer 5 and 10 second checks', JSON.stringify(tree).includes('Every 5 seconds') && JSON.stringify(tree).includes('Every 10 seconds'))

	// -- When a song with a known length ends, Last.fm is asked at once what is next (the timer never fires in this test)
	net.info = { track: { duration: '600' } }
	net.recent = nowPlaying('End Artist', 'End Song', [])
	await T.poll()
	await sleep(150)
	check('a song with a known length is on the profile', T.getAuto() && T.getAuto().title === 'End Song' && T.getAuto().duration === 600, T.getAuto())
	net.recent = nowPlaying('Next Artist', 'Next Song', [])
	await sleep(2000)
	check('the next song is picked up when the last one ends, without waiting for a timed check', T.getAuto() && T.getAuto().title === 'Next Song', T.getAuto())
	net.info = { track: { duration: '180000' } }

	// -- Clean up
	cleanups.forEach((fn) => fn())
	await sleep(50)
	check('stopping the plugins clears the status', lastFor('EskimoSoundCloudPresence').activity === null)
	check('and removes the Rich Presence hook', globalThis.eskimoRichPresence === undefined)

	// -- Upgrading: the old 30 second default becomes 10 once, other choices are kept (a fresh copy of the plugin for each)
	for (const [saved, expected, label] of [['30', '10', 'the old 30 second default moves to 10'], ['15', '15', 'a chosen 15 seconds is kept'], ['60', '60', 'a chosen minute is kept']]) {
		const fresh = load('soundcloud-presence')
		const upgradeStore = makeStore({ pollSeconds: saved })
		const doneFns = []
		fresh.default.start({ jsonStorage: upgradeStore, cleanup: (fn) => doneFns.push(fn) })
		await sleep(100)
		check(`on upgrade, ${label}`, upgradeStore.cache.pollSeconds === expected && upgradeStore.cache.fastDefaultApplied === true, upgradeStore.cache)
		doneFns.forEach((fn) => fn())
	}
	const again = load('soundcloud-presence')
	const changedStore = makeStore({ pollSeconds: '30', fastDefaultApplied: true })
	const againFns = []
	again.default.start({ jsonStorage: changedStore, cleanup: (fn) => againFns.push(fn) })
	await sleep(100)
	check('after the upgrade, choosing 30 seconds yourself is left alone', changedStore.cache.pollSeconds === '30', changedStore.cache)
	againFns.forEach((fn) => fn())

	console.log(failed ? `\n${failed} FAILED` : '\nall passed')
	process.exit(failed ? 1 : 0)
})().catch((e) => {
	console.error('CRASH', e)
	process.exit(2)
})
