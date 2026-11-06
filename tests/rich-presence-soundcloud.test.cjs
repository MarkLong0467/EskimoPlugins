'use strict'

/**
 * Tests for the SoundCloud part of Rich Presence 2.0. Run with: node tests/rich-presence-soundcloud.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * The plugin works with timers of seconds (checking Last.fm every 10 seconds, a 20 second limit on updates, an 8 second
 * second look). So the tests do not wait that long, the clock they run on goes 25 times faster than the real one: every
 * timer and `Date.now()` is scaled the same way, so the plugin sees the same sequence of events. All times below are in
 * the plugin's time.
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const fs = require('node:fs')
const path = require('node:path')
const { createReporter, createRuntime, loadPlugin, findNode, findNodes, ROOT } = require('./lib/harness.cjs')

/** Starts the plugin with a manifest, as Valenced does, and returns what is needed to stop it. */
async function startPlugin(definition, runtime, { storage }) {
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'rich-presence', 'manifest.json'), 'utf8'))
	const cleanups = []
	const errors = []
	const plugin = { manifest: { ...manifest, version: { nums: [2, 0, 0] } }, errors, reportError: e => errors.push(e), requireReload() {}, startedLate: false }
	const api = { cleanup: (...fns) => cleanups.push(...fns), decorate() {}, jsonStorage: storage, logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, plugin, unscoped: runtime.valenced }
	plugin.api = api
	await definition.start.call(plugin, { ...api, plugin })
	return {
		api,
		storage,
		errors,
		async stop() {
			for (const cleanup of [...cleanups].reverse()) if (typeof cleanup === 'function') cleanup()
		},
	}
}


const { check, done } = createReporter('Rich Presence: SoundCloud')

// ---- A faster clock -----------------------------------------------------------------------------------------------
const SPEED = 25
const realNow = Date.now.bind(Date)
const realSetTimeout = globalThis.setTimeout
const realSetInterval = globalThis.setInterval
const start = realNow()
Date.now = () => start + (realNow() - start) * SPEED
globalThis.setTimeout = (fn, ms = 0, ...rest) => realSetTimeout(fn, ms / SPEED, ...rest)
globalThis.setInterval = (fn, ms = 0, ...rest) => realSetInterval(fn, ms / SPEED, ...rest)
/** Waits for a number of milliseconds of the plugin's time. */
const sleep = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms))

// ---- A fake network ------------------------------------------------------------------------------------------------
const reply = (body, status = 200, url) => ({ ok: status >= 200 && status < 300, status, url, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })

const net = {}
const resetNet = () => {
	Object.assign(net, {
		recent: { recenttracks: { track: [] } },
		info: { track: { duration: '200000' } },
		itunes: [],
		calls: [],
		hang: false,
		delay: 0,
	})
}
resetNet()

globalThis.fetch = async url => {
	net.calls.push(String(url))
	const u = new URL(url)
	if (net.delay && (u.host === 'itunes.apple.com' || (u.host === 'ws.audioscrobbler.com' && u.searchParams.get('method') === 'track.getinfo'))) await sleep(net.delay)
	if (net.hang && u.host === 'ws.audioscrobbler.com') return new Promise(() => {})
	if (u.host === 'ws.audioscrobbler.com') {
		if (u.searchParams.get('api_key') !== 'KEY') return reply({ error: 10, message: 'Invalid API key - You must be granted a valid key by last.fm' }, 403)
		if (u.searchParams.get('method') === 'user.getrecenttracks') return reply(net.recent)
		if (u.searchParams.get('method') === 'track.getinfo') return reply(net.info)
	}
	if (u.host === 'itunes.apple.com') return reply({ results: net.itunes })
	if (u.host === 'soundcloud.com' && u.pathname === '/oembed' && u.searchParams.get('url').includes('/forss/flickermood')) {
		return reply({ title: 'Flickermood by Forss', author_name: 'Forss', author_url: 'https://soundcloud.com/forss', thumbnail_url: 'https://i1.sndcdn.com/artworks-1-large.jpg' })
	}
	if (u.host === 'soundcloud.com' && u.pathname === '/forss/flickermood') {
		return reply('<link rel="canonical" href="https://soundcloud.com/forss/flickermood"><meta itemprop="duration" content="PT00H03M33S"/>"full_duration":213890', 200, 'https://soundcloud.com/forss/flickermood')
	}
	return reply('not found', 404)
}

/** What user.getrecenttracks returns while a song plays. */
const nowPlaying = (artist, title, extra = {}) => ({
	recenttracks: { track: [{ name: title, artist: { '#text': artist }, album: { '#text': extra.album || '' }, image: extra.image || [], '@attr': { nowplaying: 'true' } }] },
})

/**
 * Builds a fake Discord, the plugin with the given saved settings, and a hook to send events. Returns helpers to read what
 * was sent to the profile.
 */
async function setup({ saved = {}, activities = [], extra = [] } = {}) {
	resetNet()
	delete globalThis.eskimoVars
	delete globalThis.eskimoTimestamps

	const appHandlers = []
	const runtime = createRuntime({ stores: { LocalActivityStore: { getActivities: () => activities } } }).install()
	const { valenced } = runtime
	valenced.react.ReactNative.AppState = { addEventListener: (type, fn) => (appHandlers.push(fn), { remove() {} }), currentState: 'active' }
	runtime.finders.loadModule({
		HTTPResponseError: class {},
		get() {},
		patch() {},
		post: async ({ body }) => ({ body: [{ external_asset_path: `external/abc/${body.urls[0].replace(/^https?:\/\//, 'https/')}` }] }),
	})

	const { definition } = loadPlugin('rich-presence')
	const scProfile = { id: 'sc', kind: 'soundcloud', label: 'SoundCloud', enabled: true, name: 'SoundCloud', type: 2 }
	const { enabled = true, ...soundcloud } = saved
	const storage = runtime.makeStorage({ enabled: true, applyOnStart: true, refreshSeconds: '0', maxActive: '3', profiles: [{ ...scProfile, enabled }, ...extra], soundcloud })
	const running = await startPlugin(definition, runtime, { storage })
	await sleep(500)

	const sent = () => runtime.log.dispatched.filter(a => a.type === 'LOCAL_ACTIVITY_UPDATE')
	const last = () => sent().at(-1)
	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	const comeBack = () => appHandlers.forEach(handler => handler('active'))
	const mountSettings = async (open = true) => {
		const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api: { jsonStorage: storage } }))
		await view.settle()
		if (open) {
			findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'SoundCloud' && n.props.arrow).props.onPress()
			await view.settle()
		}
		return view
	}
	const stop = async () => {
		await running.stop()
	}
	return { runtime, running, definition, storage, sent, last, toasts, comeBack, mountSettings, stop }
}

const AUTO = { autoEnabled: true, lfmUser: 'me', lfmKey: 'KEY', pollSeconds: '5' }

;(async () => {
	// --- A pasted link
	{
		const s = await setup()
		const view = await s.mountSettings()
		const row = label => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
		const input = () => findNode(view.tree, n => n.type === 'Design.TextInput' && n.props.label === 'SoundCloud link')
		input().props.onChange('Check out https://soundcloud.com/forss/flickermood?si=abc, great!')
		await view.settle()
		row('Show this track').props.onPress()
		await sleep(500)
		await view.settle()
		const a = s.last().activity
		check('a pasted link is shown as Listening to SoundCloud', a.name === 'SoundCloud' && a.type === 2 && a.details === 'Flickermood' && a.state === 'Forss', a)
		check('it keeps the real link and the artist link', a.details_url === 'https://soundcloud.com/forss/flickermood' && a.state_url === 'https://soundcloud.com/forss')
		check('the progress bar runs for the length of the track', a.timestamps.end - a.timestamps.start === 213890, a.timestamps)
		check('the cover is hosted through Discord in its large size', a.assets.large_image === 'mp:external/abc/https/i1.sndcdn.com/artworks-1-t500x500.jpg', a.assets)
		check('the button opens the track', JSON.stringify(a.buttons) === '["Listen on SoundCloud"]' && a.metadata.button_urls[0] === 'https://soundcloud.com/forss/flickermood')
		check('"Listening to SoundCloud" is the default status text', a.status_display_type === 0)
		check('the track is remembered in Recent', s.storage.cache.soundcloud.recents[0]?.url === 'https://soundcloud.com/forss/flickermood' && s.storage.cache.soundcloud.recents[0].startedAt === undefined, s.storage.cache.soundcloud.recents)
		check('the link box is cleared', input().props.value === '')
		check('a toast says what is showing', s.toasts().includes('Now showing Flickermood'), s.toasts())
		await s.stop()
	}
	{
		const s = await setup()
		const view = await s.mountSettings()
		const row = label => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
		findNode(view.tree, n => n.type === 'Design.TextInput' && n.props.label === 'SoundCloud link').props.onChange('not a link')
		await view.settle()
		row('Show this track').props.onPress()
		check('text that is not a link is refused', s.toasts().includes('That does not look like a SoundCloud link'), s.toasts())
		findNode(view.tree, n => n.type === 'Design.TextInput' && n.props.label === 'SoundCloud link').props.onChange('https://soundcloud.com/nobody/missing')
		await view.settle()
		row('Show this track').props.onPress()
		await sleep(500)
		check('a link that cannot be read says so', s.toasts().includes('Could not read this SoundCloud link. Is the track public?'), s.toasts())
		await s.stop()
	}

	// --- Automatic mode (Last.fm)
	{
		const s = await setup({ saved: AUTO })
		net.recent = nowPlaying('Forss', 'Flickermood', { album: 'Soulhack', image: [{ '#text': 'https://lfm.example/small.jpg' }, { '#text': 'https://lfm.example/big.jpg' }] })
		s.comeBack()
		await sleep(500)
		let a = s.last().activity
		check('what Last.fm says is playing is shown', a && a.details === 'Flickermood' && a.state === 'Forss', s.sent().map(x => x.activity?.details))
		check('the cover is the biggest Last.fm picture', a.assets.large_image.endsWith('lfm.example/big.jpg'), a.assets)
		check('the hover text on the cover is the album', a.assets.large_text === 'Soulhack')
		check('the button searches SoundCloud for the song', a.buttons[0] === 'Find on SoundCloud' && a.metadata.button_urls[0] === 'https://soundcloud.com/search/sounds?q=Forss%20Flickermood', a.metadata)
		check('track info is asked with autocorrect on', net.calls.some(u => u.includes('method=track.getinfo') && u.includes('autocorrect=1')))
		check('the length arrives and the progress bar appears', a.timestamps.end - a.timestamps.start === 200000, a.timestamps)

		const startedAt = a.timestamps.start
		const count = s.sent().length
		s.comeBack()
		await sleep(500)
		check('the same song again keeps its start time and sends nothing', s.sent().length === count && s.last().activity.timestamps.start === startedAt, s.sent().length - count)

		net.recent = nowPlaying('Other', 'Next song')
		s.comeBack()
		await sleep(500)
		check('a new song replaces the old one', s.last().activity.details === 'Next song' && s.last().activity.state === 'Other')

		net.recent = { recenttracks: { track: [] } }
		s.comeBack()
		await sleep(500)
		check('one empty report does not drop the song yet', s.last().activity.details === 'Next song')
		await sleep(30000)
		check('and a second look finds it still gone, so the status clears', s.last().activity === null, s.last())
		await s.stop()
	}
	{
		const s = await setup({ saved: AUTO })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		net.recent = { recenttracks: { track: [] } }
		s.comeBack()
		await sleep(500)
		net.recent = nowPlaying('Forss', 'Flickermood')
		await sleep(9000)
		check('if it is playing again on the second look, nothing changes', s.last().activity?.details === 'Flickermood')
		await s.stop()
	}
	{
		const s = await setup({ saved: { ...AUTO, lfmKey: 'WRONG' } })
		s.comeBack()
		await sleep(500)
		const view = await s.mountSettings()
		check('a bad key is shown in the preview, not thrown', !!findNode(view.tree, n => typeof n.props?.children === 'string' && n.props.children.includes('Invalid API key')))
		await s.stop()
	}
	{
		const s = await setup({ saved: { ...AUTO, lfmKey: '' } })
		const view = await s.mountSettings()
		findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Test Last.fm').props.onPress()
		await sleep(500)
		check('a missing key asks for it', s.toasts().includes('Enter your Last.fm name and API key first'), s.toasts())
		await s.stop()
	}
	{
		const s = await setup({ saved: AUTO })
		const view = await s.mountSettings()
		net.recent = nowPlaying('Forss', 'Flickermood')
		findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Test Last.fm').props.onPress()
		await sleep(500)
		check('Test Last.fm reports what is playing', s.toasts().includes('Connected. Now playing: Flickermood by Forss'), s.toasts())
		check('the settings offer checks every 5 and 10 seconds', findNodes(view.tree, n => n.type === 'Design.TableRadioRow').filter(n => /^Every (5|10) seconds$/.test(n.props.label)).length === 2)
		await s.stop()
	}

	// --- Covers
	{
		const s = await setup({ saved: AUTO })
		net.recent = nowPlaying('Forss', 'Flickermood')
		net.itunes = []
		s.comeBack()
		await sleep(500)
		check('with no cover anywhere the default cover is shown, not an empty box', s.last().activity.assets.large_image.endsWith('/plugins/rich-presence/cover.png'), s.last().activity.assets)
		await s.stop()
	}
	{
		const s = await setup({ saved: AUTO })
		net.recent = nowPlaying('Forss', 'Flickermood')
		net.itunes = [{ trackName: 'Flickermood', artistName: 'Forss', artworkUrl100: 'https://is1.example/100x100bb.jpg' }]
		s.comeBack()
		await sleep(500)
		check('Apple Music supplies the cover when Last.fm has none', s.last().activity.assets.large_image.endsWith('is1.example/600x600bb.jpg'), s.last().activity.assets)
		await s.stop()
	}
	{
		const s = await setup({ saved: AUTO })
		net.recent = nowPlaying('Forss', 'Flickermood')
		net.itunes = [{ trackName: 'Flickermood', artistName: 'Somebody Else', artworkUrl100: 'https://is1.example/100x100bb.jpg' }]
		s.comeBack()
		await sleep(500)
		check('a result by a different artist is never used', !s.last().activity.assets.large_image.includes('is1.example'), s.last().activity.assets)
		await s.stop()
	}
	{
		const s = await setup({ saved: { ...AUTO, coverLookup: false } })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		check('with "Find missing covers" off, Apple is not asked', !net.calls.some(u => u.includes('itunes.apple.com')))
		await s.stop()
	}
	{
		const s = await setup({ saved: { ...AUTO, fallbackCover: false } })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		check('with the default cover off and none found, no image is sent', s.last().activity.assets === undefined, s.last().activity)
		await s.stop()
	}
	{
		const s = await setup({ saved: { ...AUTO, smallIcon: 'https://img.example/sc.png' } })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		const a = s.last().activity.assets
		check('the optional small icon is sent in the corner', a.small_image === 'mp:external/abc/https/img.example/sc.png' && a.small_text === 'SoundCloud', a)
		await s.stop()
	}

	// --- Appearance settings
	{
		const s = await setup({ saved: { ...AUTO, showArtist: false, showButton: false, timerMode: 'elapsed', statusText: 2 } })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		const a = s.last().activity
		check('the artist and the button can be left out', a.state === undefined && a.buttons === undefined)
		check('an elapsed timer has no end', a.timestamps.end === undefined && a.timestamps.start > 0, a.timestamps)
		check('the status text can be the title', a.status_display_type === 2)
		await s.stop()
	}
	{
		const s = await setup({ saved: { ...AUTO, timerMode: 'none', statusText: 1 } })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		check('with no timer there are no timestamps', s.last().activity.timestamps === undefined)
		check('the status text can be the artist', s.last().activity.status_display_type === 1)
		await s.stop()
	}

	// --- Spotify steps aside
	{
		const others = []
		const s = await setup({ saved: AUTO, activities: others })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		check('it shows at first', s.last().activity?.details === 'Flickermood')
		await sleep(21000)
		others.push({ type: 2, name: 'Spotify', application_id: '12345' })
		s.runtime.fire('SPOTIFY_PLAYER_STATE', {})
		await sleep(2500)
		check('a Spotify event makes the status step aside', s.last().activity === null, s.last())
		await sleep(21000)
		others.length = 0
		s.runtime.fire('SPOTIFY_PLAYER_PLAY', {})
		await sleep(2500)
		check('with Spotify gone it shows again', s.last().activity?.details === 'Flickermood')
		await sleep(21000)
		others.push({ type: 2, name: 'SoundCloud', application_id: '0' })
		s.runtime.fire('SPOTIFY_PLAYER_STATE', {})
		await sleep(2500)
		check('its own activity does not hide itself', s.last().activity?.details === 'Flickermood')
		await s.stop()
	}
	{
		const s = await setup({ saved: { ...AUTO, hideWithSpotify: false }, activities: [{ type: 2, name: 'Spotify', application_id: '12345' }] })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		check('with "Hide while Spotify is playing" off, it still shows', s.last().activity?.details === 'Flickermood')
		await s.stop()
	}

	// --- Sending within Discord's limits
	{
		const s = await setup({ saved: { ...AUTO, coverLookup: false } })
		net.recent = nowPlaying('A', 'One')
		s.comeBack()
		await sleep(300)
		const before = s.sent().length
		s.comeBack()
		await sleep(300)
		check('identical updates are not sent again', s.sent().length === before)
		for (const [i, title] of ['Two', 'Three', 'Four', 'Five', 'Six'].entries()) {
			net.recent = nowPlaying('A', title)
			s.comeBack()
			await sleep(300)
		}
		const burst = s.sent().length - before
		check('a quick run of new songs sends at most the allowance at once', burst <= 4, burst)
		check('the newest song is waiting, not lost', s.last().activity?.details !== 'Six')
		await sleep(22000)
		check('the newest song goes out once the allowance frees up', s.last().activity?.details === 'Six', s.last().activity?.details)
		await s.stop()
	}

	// --- Reconnecting, ending, stopping
	{
		const s = await setup({ saved: AUTO })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		const before = s.sent().length
		s.runtime.fire('CONNECTION_OPEN', {})
		await sleep(4000)
		check('after Discord reconnects the status is sent again', s.sent().length === before + 1 && s.last().activity?.details === 'Flickermood', s.sent().length - before)
		await s.stop()
	}
	{
		const s = await setup({ saved: AUTO })
		net.info = { track: { duration: '4000' } }
		net.recent = nowPlaying('Forss', 'Short song')
		s.comeBack()
		await sleep(500)
		check('a song with a known length is on the profile', s.last().activity?.details === 'Short song' && s.last().activity.timestamps.end > 0)
		net.recent = nowPlaying('Forss', 'Next one')
		await sleep(3500)
		check('the next song is picked up when the last one ends, without waiting for a timed check', s.last().activity?.details === 'Next one', s.last().activity)
		await s.stop()
	}
	{
		const s = await setup({ saved: { clearAtEnd: true, current: { url: 'https://soundcloud.com/a/b', title: 'Done', artist: 'A', artistUrl: '', artwork: '', duration: 2000, startedAt: Date.now() - 1500 } } })
		await sleep(5000)
		check('the status clears when the track ends', s.last()?.activity === null, s.sent().map(x => x.activity?.details))
		await s.stop()
	}
	{
		const s = await setup({ saved: AUTO })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		await s.stop()
		check('stopping the plugin clears the status', s.last().activity === null)
		const before = s.sent().length
		net.recent = nowPlaying('Forss', 'Never shown')
		s.comeBack()
		await sleep(1500)
		check('and it stops checking', s.sent().length === before)
	}

	// --- Slow and stuck requests
	{
		const s = await setup({ saved: AUTO })
		net.recent = nowPlaying('Forss', 'Flickermood')
		net.info = { track: { duration: '200000' } }
		net.delay = 4000
		s.comeBack()
		await sleep(500)
		const a = s.last().activity
		check('the new song is on the profile before the slow lookups return', a.details === 'Flickermood')
		check('...first with no progress bar, because the length is not known yet', a.timestamps.end === undefined, a.timestamps)
		await sleep(5000)
		check('...then the length arrives and the progress bar appears', s.last().activity.timestamps.end - s.last().activity.timestamps.start === 200000, s.last().activity.timestamps)
		await s.stop()
	}
	{
		const s = await setup({ saved: AUTO })
		net.hang = true
		s.comeBack()
		// The request gives up after 8 seconds; the next timed check is at 10, so look in between.
		await sleep(8600)
		const view = await s.mountSettings()
		check('a stuck Last.fm request gives up and says so', !!findNode(view.tree, n => typeof n.props?.children === 'string' && n.props.children.includes('Last.fm did not answer in time')))
		net.hang = false
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(500)
		check('the next check works normally afterwards', s.last().activity?.details === 'Flickermood')
		await s.stop()
	}

	// --- Actions
	{
		const s = await setup()
		const view = await s.mountSettings()
		const row = label => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
		row('Restart the timer').props.onPress()
		check('restarting the timer needs a track', s.toasts().includes('Show a track first'))
		findNode(view.tree, n => n.type === 'Design.TextInput' && n.props.label === 'SoundCloud link').props.onChange('https://soundcloud.com/forss/flickermood')
		await view.settle()
		row('Show this track').props.onPress()
		await sleep(500)
		await view.settle()
		check('a track is on the profile', s.last().activity?.details === 'Flickermood')
		row('Stop showing').props.onPress()
		await sleep(500)
		check('Stop showing clears the status and forgets the track', s.last().activity === null && s.storage.cache.soundcloud.current === null, s.storage.cache.soundcloud.current)
		await s.stop()
	}

	// --- Merged into Rich Presence
	{
		const custom = { id: 'c', kind: 'custom', label: 'C', enabled: true, name: 'Now playing', type: 3, details: '{sc_title}', state: '{sc_artist}', applicationId: '', timestampMode: 'external', scheduleOn: false, scheduleDays: [true, true, true, true, true, true, true] }
		const s = await setup({ saved: AUTO, extra: [custom] })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(1500)
		const sc = s.sent().filter(a => a.activity?.name === 'SoundCloud').at(-1)
		const mine = s.sent().filter(a => a.activity?.name === 'Now playing').at(-1)
		check('the SoundCloud card and a custom card show together, on separate sockets', sc && mine && sc.socketId !== mine.socketId && sc.activity.application_id !== mine.activity.application_id, [sc?.socketId, mine?.socketId])
		check('the custom card uses the track in its texts and its timer', mine.activity.details === 'Flickermood' && mine.activity.state === 'Forss' && mine.activity.timestamps.start > 0, mine.activity)
		const view = await s.mountSettings()
		check('the SoundCloud editor shows no custom fields', !findNode(view.tree, n => n.type === 'Design.TextInput' && ['Activity name', 'Application ID'].includes(n.props.label)) && !!findNode(view.tree, n => n.type === 'Design.TextInput' && n.props.label === 'Last.fm username'))
		await s.stop()
	}
	{
		const s = await setup({ saved: { ...AUTO, enabled: false } })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(1500)
		check('with the SoundCloud switch off nothing is sent and Last.fm is not asked', s.sent().every(a => a.activity === null) && !net.calls.some(u => u.includes('audioscrobbler')), net.calls.length)
		await s.stop()
	}
	{
		const s = await setup({ saved: AUTO, extra: [{ id: 'k', kind: 'custom', label: 'K', enabled: true, name: 'Other', type: 2, details: '', applicationId: '', timestampMode: 'none', scheduleOn: false, scheduleDays: [true, true, true, true, true, true, true] }] })
		net.recent = nowPlaying('Forss', 'Flickermood')
		s.comeBack()
		await sleep(1500)
		check('a custom Listening to card of this plugin does not hide SoundCloud', s.sent().some(a => a.activity?.details === 'Flickermood'))
		await s.stop()
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
