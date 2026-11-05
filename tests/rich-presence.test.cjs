'use strict'

/**
 * Tests for Rich Presence. Run with: node tests/rich-presence.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Rich Presence')

// The plugin waits 3 seconds after Discord reconnects. The tests do not need to wait that long.
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...rest) => (ms === 3000 ? setImmediate(fn, ...rest) : realSetTimeout(fn, ms, ...rest))

/** A profile with the given fields over a blank one. */
const profile = (fields = {}) => ({
	id: 'default',
	label: 'Default',
	name: '',
	type: 0,
	details: '',
	detailsUrl: '',
	state: '',
	stateUrl: '',
	applicationId: '',
	streamUrl: '',
	largeImage: '',
	largeUrl: '',
	largeText: '',
	smallImage: '',
	smallUrl: '',
	smallText: '',
	timestampMode: 'none',
	customStart: '',
	customEnd: '',
	countdownMinutes: '30',
	partyCurrent: '',
	partyMax: '',
	button1Label: '',
	button1Url: '',
	button2Label: '',
	button2Url: '',
	showOnlyWhen: '',
	...fields,
})

/**
 * Builds a fake Discord, with the settings `saved`, the plugin running, and (if asked) Discord's asset code or web API.
 * Returns the activities that were sent so far through `activities()`.
 */
async function setup({ fields = null, settings = {}, assetUtils = null, http = null, token = null, user = { username: 'chase', globalName: 'Chase' }, startApply = true } = {}) {
	const saved = fields ? { profiles: [profile(fields)], activeProfile: 'default', applyOnStart: startApply, ...settings } : { applyOnStart: startApply, ...settings }
	const runtime = createRuntime({ stores: { UserStore: { getCurrentUser: () => user } } }).install()
	const requests = []
	const realFetch = globalThis.fetch
	globalThis.fetch = async (url, init = {}) => {
		requests.push({ url: String(url), init })
		return globalThis.__fetchAnswer ? globalThis.__fetchAnswer(String(url), init) : { ok: false, status: 404, headers: { get: () => '' } }
	}
	delete globalThis.eskimoVars
	delete globalThis.eskimoTimestamps
	if (assetUtils) runtime.finders.loadModule(assetUtils)
	if (http) runtime.finders.loadModule(http)
	if (token) runtime.finders.loadModule({ getToken: () => token })

	const { definition } = loadPlugin('rich-presence')
	const storage = runtime.makeStorage(saved)
	const running = await startPlugin(definition, runtime, { storage })
	await sleep(30)
	const activities = () => runtime.log.dispatched.filter(a => a.type === 'LOCAL_ACTIVITY_UPDATE')
	const last = () => activities().at(-1)
	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	const restore = async () => {
		await running.stop()
		globalThis.fetch = realFetch
		delete globalThis.__fetchAnswer
	}
	return { runtime, running, definition, storage, activities, last, toasts, requests, restore }
}

;(async () => {
	// --- Nothing without a name
	{
		const s = await setup()
		check('without an activity name the presence is cleared', s.activities().length === 1 && s.last().activity === null, s.activities())
		check('it is sent as a game would report it', s.last().pid === 1337 && s.last().socketId === 'EskimoRichPresence')
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'My game' }, startApply: false })
		check('with "apply on start" off nothing is sent at start', s.activities().length === 0, s.activities())
		await s.restore()
	}

	// --- The activity
	{
		const s = await setup({
			fields: {
				name: 'My game',
				type: 2,
				details: 'Level {seconds}',
				state: 'for {user}',
				detailsUrl: 'https://example.com/d',
				stateUrl: 'not a link',
				partyCurrent: '9',
				partyMax: '4',
				applicationId: ' 123 ',
			},
		})
		const a = s.last().activity
		check('the name, type and application are sent', a.name === 'My game' && a.type === 2 && a.application_id === '123' && a.flags === 1, a)
		check('variables are filled in', /^Level \d\d$/.test(a.details) && a.state === 'for Chase', a)
		check('a details link is kept and a bad one dropped', a.details_url === 'https://example.com/d' && a.state_url === undefined)
		check('a party larger than its maximum is clamped', JSON.stringify(a.party) === '{"size":[4,4]}', a.party)
		check('there is no timer by default', a.timestamps === undefined)
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'Streamer', type: 1, streamUrl: 'https://twitch.tv/x' } })
		check('a streaming presence carries the stream link', s.last().activity.url === 'https://twitch.tv/x')
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'Vars', details: '{nope}|{sc_title}|{custom}|{sc_artist}|{time}', state: '{uptime}' }, startApply: false })
		globalThis.eskimoVars = { custom: 'ok', sc_artist: 'Band' }
		globalThis.eskimoRichPresence.apply()
		await sleep(300)
		const a = s.last().activity
		const [nope, title, custom, artist, time] = a.details.split('|')
		check('unknown variables are left as typed', nope === '{nope}')
		check('SoundCloud variables are empty when nothing provides them', title === '')
		check('variables from another plugin are used', custom === 'ok' && artist === 'Band')
		check('{time} looks like a time', /^\d\d:\d\d$/.test(time), time)
		check('{uptime} looks like a duration', /^\d+:\d\d$/.test(a.state), a.state)
		check('another plugin can ask for the presence to be sent again', s.activities().length === 1)
		await s.restore()
		delete globalThis.eskimoVars
	}
	{
		const s = await setup({ fields: { name: 'Gate', showOnlyWhen: '{sc_title}' } })
		check('"show only when" hides the presence while its text is empty', s.last().activity === null)
		globalThis.eskimoVars = { sc_title: 'A song' }
		globalThis.eskimoRichPresence.apply()
		await sleep(300)
		check('...and shows it when there is text', s.last().activity?.name === 'Gate')
		await s.restore()
		delete globalThis.eskimoVars
	}

	// --- Timers
	{
		const s = await setup({ fields: { name: 'T', timestampMode: 'elapsed' } })
		const start = s.last().activity.timestamps.start
		check('elapsed counts from when it was applied', Math.abs(Date.now() - start) < 2000, start)
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'T', timestampMode: 'countdown', countdownMinutes: '10' } })
		const end = s.last().activity.timestamps.end
		check('countdown ends the given minutes after it was applied', Math.abs(end - (Date.now() + 600000)) < 2000, end - Date.now())
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'T', timestampMode: 'clock' } })
		const now = new Date()
		const midnight = new Date(now).setHours(0, 0, 0, 0)
		check('clock counts from midnight', Math.abs(s.last().activity.timestamps.start - midnight) < 2000)
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'T', timestampMode: 'custom', customStart: '1700000000', customEnd: '1700000600' } })
		const t = s.last().activity.timestamps
		check('a custom timer with both times loops from now with the same length', t.end - t.start === 600000 && Math.abs(t.start - Date.now()) < 2000, t)
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'T', timestampMode: 'custom', customStart: '1700000000000' } })
		check('a custom timer with only a start uses it', JSON.stringify(s.last().activity.timestamps) === '{"start":1700000000000}', s.last().activity.timestamps)
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'T', timestampMode: 'custom', customStart: 'not a date' } })
		check('a custom timer that is not a time gives no timer', s.last().activity.timestamps === undefined)
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'T', timestampMode: 'external' }, startApply: false })
		globalThis.eskimoTimestamps = { start: 1000, end: 5000 }
		globalThis.eskimoRichPresence.apply()
		await sleep(300)
		check('an external timer uses the other plugin\'s times', JSON.stringify(s.last().activity.timestamps) === '{"start":1000,"end":5000}', s.last().activity.timestamps)
		globalThis.eskimoTimestamps = { start: 1000 }
		globalThis.eskimoRichPresence.apply()
		await sleep(300)
		check('...also with only a start', JSON.stringify(s.last().activity.timestamps) === '{"start":1000}')
		await s.restore()
		delete globalThis.eskimoTimestamps
	}

	// --- Buttons
	{
		const s = await setup({ fields: { name: 'B', button1Label: 'Open this very long label that goes past thirty-two characters', button1Url: 'https://a.example', button2Label: 'Bad', button2Url: 'ftp://x', } })
		const a = s.last().activity
		check('a button needs a label and a web link', a.buttons.length === 1 && a.metadata.button_urls[0] === 'https://a.example', a)
		check('a button label is cut to 32 characters', a.buttons[0].length === 32)
		await s.restore()
	}

	// --- Images
	{
		const calls = []
		const assetUtils = { fetchAssetIds: async (app, keys) => (calls.push([app, keys[0]]), [`asset:${app}:${keys[0]}`]) }
		const s = await setup({ fields: { name: 'I', applicationId: '555', largeImage: 'key1', smallImage: 'mp:external/abc', largeText: 'Big', smallText: 'Small' }, assetUtils })
		const a = s.last().activity
		check('an asset key is looked up with the application', a.assets.large_image === 'asset:555:key1', a.assets)
		check('an mp: id passes through unchanged', a.assets.small_image === 'mp:external/abc')
		check('image texts are sent with their images', a.assets.large_text === 'Big' && a.assets.small_text === 'Small')
		await s.restore()
	}
	{
		const assetUtils = { fetchAssetIds: async (app, keys) => (app === '555' ? [] : [`fallback:${keys[0]}`]) }
		const s = await setup({ fields: { name: 'I', applicationId: '555', largeImage: 'key2' }, assetUtils })
		check('the fallback application is tried when yours has no such image', s.last().activity.assets.large_image === 'fallback:key2', s.last().activity.assets)
		await s.restore()
	}
	{
		// A direct image link goes to Discord's web API to be hosted.
		const posts = []
		const http = { get() {}, post: async ({ url, body }) => (posts.push({ url, body }), { body: [{ external_asset_path: 'external/xyz/pic.png' }] }), patch() {}, HTTPResponseError: class {} }
		const s = await setup({ fields: { name: 'L', largeImage: 'https://i.example.com/pic.png', largeUrl: 'https://page.example' }, http })
		const a = s.last().activity
		check('an image link is hosted through Discord', a.assets.large_image === 'mp:external/xyz/pic.png' && posts[0].url === '/applications/0/external-assets' && posts[0].body.urls[0] === 'https://i.example.com/pic.png', { a: a.assets, posts })
		check('the image link is sent with the image', a.assets.large_url === 'https://page.example')
		await s.restore()
	}
	{
		// An Imgur page link becomes the image link.
		const posts = []
		const http = { get() {}, post: async ({ body }) => (posts.push(body.urls[0]), { body: [{ external_asset_path: 'e/i.png' }] }), patch() {}, HTTPResponseError: class {} }
		const s = await setup({ fields: { name: 'L', largeImage: 'https://imgur.com/abcde12' }, http })
		check('an Imgur page link becomes the picture', posts[0] === 'https://i.imgur.com/abcde12.png', posts)
		await s.restore()
	}
	{
		// A web page gives the picture it would embed.
		globalThis.__fetchAnswer = async url =>
			url.startsWith('https://page.example')
				? { ok: true, status: 200, headers: { get: () => 'text/html' }, text: async () => '<html><head><meta property="og:image" content="/img/cover.jpg"></head></html>' }
				: { ok: false, status: 404, headers: { get: () => '' } }
		const posts = []
		const http = { get() {}, post: async ({ body }) => (posts.push(body.urls[0]), { body: [{ external_asset_path: 'e/c.jpg' }] }), patch() {}, HTTPResponseError: class {} }
		const s = await setup({ fields: { name: 'L', largeImage: 'https://page.example/post/1' }, http })
		check('a web page gives its og:image, made absolute', posts[0] === 'https://page.example/img/cover.jpg', posts)
		await s.restore()
	}
	{
		// No way to host: the error is shown in the preview and no image is sent.
		const http = { get() {}, post: async () => { throw Object.assign(new Error('nope'), { status: 400, body: { message: 'Bad link' } }) }, patch() {}, HTTPResponseError: class {} }
		const s = await setup({ fields: { name: 'L', largeImage: 'https://i.example.com/a.png' }, http })
		check('a refused image is left out', s.last().activity.assets === undefined, s.last().activity)
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		check('the preview says why', findNodes(view.tree, n => typeof n.props?.children === 'string' && n.props.children.includes('Large image not sent: Bad link')).length === 1)
		await s.restore()
	}
	{
		// Asset keys with no Discord code: the application's public list is used.
		globalThis.__fetchAnswer = async url =>
			url.includes('/oauth2/applications/777/assets') ? { ok: true, status: 200, json: async () => [{ name: 'logo', id: 'id-logo' }] } : { ok: false, status: 404 }
		const s = await setup({ fields: { name: 'L', applicationId: '777', largeImage: 'logo' } })
		check('an asset key is found in the application\'s public list', s.last().activity.assets.large_image === 'id-logo', s.last().activity)
		await s.restore()
	}

	// --- Switching off, stopping, reconnecting
	{
		const s = await setup({ fields: { name: 'Off' }, settings: { enabled: false } })
		check('when switched off the presence is cleared', s.last().activity === null)
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'Stop' } })
		check('the presence is sent at start', s.last().activity?.name === 'Stop')
		check('other plugins can reach the plugin', typeof globalThis.eskimoRichPresence?.apply === 'function')
		await s.running.stop()
		check('stopping clears the presence', s.last().activity === null)
		check('stopping takes the hook away', globalThis.eskimoRichPresence === undefined)
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'Back' } })
		const before = s.activities().length
		s.runtime.fire('CONNECTION_OPEN', {})
		await sleep(60)
		check('the presence is sent again when Discord reconnects', s.activities().length === before + 1, s.activities().length)
		await s.restore()
	}

	// --- The settings screen
	{
		const s = await setup({ fields: { name: 'Screen', details: 'Hello' } })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		const row = label => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
		check('the preview shows the title and details', !!findNode(view.tree, n => n.props?.children === 'Playing Screen') && !!findNode(view.tree, n => n.props?.children === 'Hello'))

		const before = s.activities().length
		const input = label => findNode(view.tree, n => n.type === 'Design.TextInput' && n.props.label === label)
		input('Details').props.onChange('Typing')
		await view.settle()
		check('the preview follows what is being typed', !!findNode(view.tree, n => n.props?.children === 'Typing'))
		check('nothing is saved while typing', s.storage.cache.profiles[0].details === 'Hello')
		await sleep(700)
		await view.settle()
		check('the text is saved after typing stops', s.storage.cache.profiles[0].details === 'Typing', s.storage.cache.profiles[0].details)
		check('...and the presence is sent once', s.activities().length === before + 1 && s.last().activity.details === 'Typing', s.activities().length - before)

		row('New profile').props.onPress()
		await sleep(50)
		await view.settle()
		check('a new profile is added and chosen', s.storage.cache.profiles.length === 2 && s.storage.cache.activeProfile === s.storage.cache.profiles[1].id, s.storage.cache)
		row('Duplicate profile').props.onPress()
		await sleep(50)
		check('a profile can be duplicated', s.storage.cache.profiles.length === 3 && /copy$/.test(s.storage.cache.profiles[2].label), s.storage.cache.profiles.map(p => p.label))
		row('Delete profile').props.onPress()
		await sleep(50)
		check('a profile can be deleted', s.storage.cache.profiles.length === 2)
		row('Use for SoundCloud').props.onPress()
		await sleep(50)
		const sc = s.storage.cache.profiles.at(-1)
		check('the SoundCloud profile is set up', sc.name === 'SoundCloud' && sc.type === 2 && sc.details === '{sc_title}' && sc.timestampMode === 'external' && sc.showOnlyWhen === '{sc_title}' && s.toasts().includes('SoundCloud profile added'), sc)
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'Only' } })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Delete profile').props.onPress()
		check('the last profile cannot be deleted', s.toasts().includes('Keep at least one profile') && s.storage.cache.profiles.length === 1)
		await s.restore()
	}
	{
		const copied = []
		const s = await setup({ fields: { name: 'Copy me', details: 'x' } })
		const clip = s.runtime.valenced.externals.ReactNativeClipboard.Clipboard
		clip.setString = text => copied.push(text)
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		const row = label => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
		row('Copy profile').props.onPress()
		const data = JSON.parse(copied[0])
		check('a profile is copied as JSON without its id', data.name === 'Copy me' && data.details === 'x' && data.id === undefined, data)
		clip.getString = async () => JSON.stringify({ ...data, name: 'Pasted', label: 'From clipboard', sneaky: 'ignored' })
		row('Paste profile').props.onPress()
		await sleep(50)
		const pasted = s.storage.cache.profiles.at(-1)
		check('a profile is added from the clipboard', pasted.name === 'Pasted' && pasted.label === 'From clipboard' && pasted.sneaky === undefined, pasted)
		clip.getString = async () => 'not json'
		row('Paste profile').props.onPress()
		await sleep(50)
		check('a bad clipboard says so', s.toasts().includes('Clipboard has no copied profile'))
		await s.restore()
	}
	{
		const s = await setup({ fields: { name: 'Act' } })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		const row = label => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
		row('Clear presence').props.onPress()
		check('Clear presence removes the presence', s.last().activity === null && s.toasts().includes('Presence cleared'))
		row('Apply now').props.onPress()
		await sleep(80)
		check('Apply now sends it again', s.last().activity?.name === 'Act' && s.toasts().includes('Presence applied'))
		const switchRow = findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === 'Show presence')
		switchRow.props.onValueChange(false)
		await sleep(350)
		check('switching it off clears the presence', s.last().activity === null)
		await s.restore()
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
