'use strict'

/**
 * Tests for Spotify Tools. Run with: node tests/spotify-tools.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Spotify Tools')

const ME = 'me-1'
const OTHER = '2000'
const CHANNEL = 'chan-1'

/** The activity of somebody listening on Spotify, in a session others can join. */
const activityOf = (userId, extra = {}) => ({
	type: 2,
	name: 'Spotify',
	sync_id: 'trk1',
	details: 'A Song',
	party: { id: `spotify:${userId}` },
	timestamps: { start: Date.now() - 5000 },
	metadata: { album_id: 'alb1234567890' },
	...extra,
})

/**
 * Builds a fake Discord with the stores the plugin reads and, optionally, Discord's Spotify controls, the module that
 * sends messages, and Spotify's web API. Returns the running plugin and everything that was called.
 */
async function setup({
	saved = {},
	mine = null,
	track = null,
	presence = {},
	controls = false,
	socket = { socket: { accessToken: 'tok' }, device: { id: 'devDiscord' } },
	draft = 'my text',
	channel = CHANNEL,
	sender = true,
	icon = false,
	assetNames = {},
	rest = null,
} = {}) {
	const calls = { play: [], sync: [], sent: [], cleared: [], fetch: [] }
	const presenceMap = { ...presence }
	const runtime = createRuntime({
		stores: {
			SpotifyStore: { getActivity: () => mine, getTrack: () => track, getActiveSocketAndDevice: () => socket },
			UserStore: { getCurrentUser: () => ({ id: ME }) },
			PresenceStore: { getActivities: id => presenceMap[id] || [] },
			DraftStore: { getDraft: () => draft },
			ChannelStore: { getChannel: () => ({ name: 'general' }) },
			SelectedChannelStore: { getChannelId: () => channel },
		},
		overrides: { assets: { AssetsRegistry: { getAssetByID: id => (assetNames[id] ? { name: assetNames[id] } : undefined) } } },
	}).install()
	const { valenced } = runtime
	valenced.utils.discord = { lookupGeneratedIconComponent: name => (icon && name === 'UserPlayIcon' ? function PlayIcon() { return null } : undefined) }
	valenced.assets.getAssetIdByName = name => (name === 'ic_spotify_white_16px' ? 777 : name)

	if (controls) {
		runtime.finders.loadModule({
			play: (activity, userId) => calls.play.push({ activity, userId }),
			sync: (activity, userId) => calls.sync.push({ activity, userId }),
		})
	}
	if (sender) {
		runtime.finders.loadModule({
			sendMessage: (channelId, message, clearDraft, options) => calls.sent.push({ channelId, message, clearDraft, options }),
			revealMessage() {},
		})
	}
	runtime.finders.loadModule({ clearDraft: (channelId, type) => calls.cleared.push({ channelId, type }) })
	if (rest) runtime.finders.loadModule(rest)

	const realFetch = globalThis.fetch
	const web = { devices: [{ id: 'devX', is_active: true }], playStatus: 200, track: null }
	globalThis.fetch = async (url, init = {}) => {
		calls.fetch.push({ url, init })
		if (url.endsWith('/me/player/devices')) return { ok: true, json: async () => ({ devices: web.devices }) }
		if (url.includes('/me/player/play')) return { ok: web.playStatus < 400, status: web.playStatus }
		if (url.includes('/tracks/')) return { ok: !!web.track, json: async () => web.track }
		return { ok: false, status: 500 }
	}

	const { definition } = loadPlugin('spotify-tools')
	const storage = runtime.makeStorage(saved)
	const running = await startPlugin(definition, runtime, { storage })
	await sleep(5)
	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	const sheets = () => runtime.log.actions.filter(a => a.label === 'actionSheet').map(a => a.name)
	// Ends the scenario: the plugin is stopped so its timers do not run into the next scenario, and fetch is put back.
	const restore = () => {
		running.stop()
		globalThis.fetch = realFetch
	}
	return { runtime, valenced, running, definition, storage, calls, toasts, sheets, web, presenceMap, restore }
}

/** The element of the + menu: a list of items under `props.items`, as Discord makes it. */
const plusMenu = (extra = []) => ({
	type: 'ActionSheet',
	props: {
		items: [
			{ label: 'Camera', id: 'cam', key: 'cam', action() {}, iconSource: 1 },
			{ label: 'Photos', id: 'photos', key: 'photos', action() {}, iconSource: 2 },
			{ label: 'Poll', id: 'poll', key: 'poll', action() {}, iconSource: 3 },
			...extra,
		],
	},
})

;(async () => {
	// --- Settings
	{
		const s = await setup({ saved: { sendSongLink: false } })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		const rows = () => findNodes(view.tree, n => n.type === 'Design.TableSwitchRow')
		check('there is a switch for each feature', rows().length === 5, rows().map(r => r.props.label))
		check('a switch is on unless it was turned off', rows().find(r => r.props.label === 'Send song link').props.value === false && rows().find(r => r.props.label === 'Send listen along').props.value === true)
		rows().find(r => r.props.label === '+ menu').props.onValueChange(false)
		await view.settle()
		check('a switch is saved the moment it changes', s.storage.cache.plusMenu === false, s.storage.cache)
		check('the credit and the requirements are shown', !!findNode(view.tree, n => n.props?.label === 'Credit') && !!findNode(view.tree, n => n.props?.label === 'Before you start'))
		s.restore()
	}

	// --- The + menu
	{
		const s = await setup({ mine: activityOf(ME), track: { id: 'trkA', album: { id: 'albA' } } })
		const element = s.valenced.react.ReactJSXRuntime.jsx('ActionSheet', plusMenu().props)
		const labels = element.props.items.map(i => i.label)
		check('the three send options are added to the + menu', JSON.stringify(labels.slice(3)) === JSON.stringify(['Send listen along', 'Send song link', 'Send playing album']), labels)
		const added = element.props.items[3]
		check('an option does not keep the identity of the item it was copied from', added.id === undefined && added.key === undefined)
		check('an option has the Spotify icon', added.iconSource === 777)

		// A second draw of the same menu is not given the options again.
		const again = s.valenced.react.ReactJSXRuntime.jsx('ActionSheet', element.props)
		check('a menu that already has the options is left alone', again.props.items.length === 6, again.props.items.length)

		added.action()
		added.action()
		await sleep(10)
		check('tapping an option closes the sheets', s.sheets().includes('hideAllActionSheets'))
		check('a second handler for one tap is ignored', s.calls.sent.length === 1, s.calls.sent.length)
		s.restore()
	}
	{
		const s = await setup({ saved: { sendInvite: false, sendAlbumLink: false } })
		const element = s.valenced.react.ReactJSXRuntime.jsx('ActionSheet', plusMenu().props)
		check('options that are switched off are not added', element.props.items.map(i => i.label).slice(3).join() === 'Send song link', element.props.items.map(i => i.label))
		s.restore()
	}
	{
		const s = await setup({ saved: { plusMenu: false } })
		const element = s.valenced.react.ReactJSXRuntime.jsx('ActionSheet', plusMenu().props)
		check('with the + menu switch off nothing is added', element.props.items.length === 3)
		s.restore()
	}
	{
		const s = await setup()
		const other = s.valenced.react.ReactJSXRuntime.jsx('ActionSheet', { items: [{ label: 'Block', action() {} }, { label: 'Mute', action() {} }] })
		check('a menu that is not the + menu is left alone', other.props.items.length === 2)
		const single = s.valenced.react.ReactJSXRuntime.jsx('ActionSheet', { items: [{ label: 'Camera', action() {} }] })
		check('a menu with one item is left alone', single.props.items.length === 1)
		const huge = s.valenced.react.ReactJSXRuntime.jsx('ActionSheet', { items: new Array(30).fill({ label: 'Camera' }) })
		check('a huge list is left alone', huge.props.items.length === 30)
		const plain = s.valenced.react.ReactJSXRuntime.jsx('View', { children: 'x' })
		check('an element without items is left alone', plain.props.children === 'x')
		s.restore()
	}
	{
		// The menu is found by its icons when the labels are in another language.
		const s = await setup({ assetNames: { 11: 'CameraIcon', 12: 'ImageIcon', 13: 'PollIcon', 14: 'PaperclipIcon' } })
		const items = [
			{ label: 'Appareil', action() {}, iconSource: 11 },
			{ label: 'Photos', action() {}, iconSource: 12 },
			{ label: 'Sondage', action() {}, iconSource: 13 },
			{ label: 'Fichiers', action() {}, iconSource: 14 },
		]
		const element = s.valenced.react.ReactJSXRuntime.jsx('ActionSheet', { items })
		check('the + menu is found by its icons in any language', element.props.items.length === 7, element.props.items.length)
		s.restore()
	}

	// --- Sending
	const sendFrom = async (s, label) => {
		const element = s.valenced.react.ReactJSXRuntime.jsx('ActionSheet', plusMenu().props)
		element.props.items.find(i => i.label === label).action()
		await sleep(10)
	}
	{
		const s = await setup({ mine: activityOf(ME), draft: 'hello' })
		await sendFrom(s, 'Send listen along')
		const [sent] = s.calls.sent
		check('the invite is sent to the open chat with the typed text', sent && sent.channelId === CHANNEL && sent.message.content === 'hello', s.calls.sent)
		check('the invite carries the activity as a listen along invite', sent.options.activityAction.type === 3 && sent.options.activityAction.activity.party.id === `spotify:${ME}`)
		check('the draft is cleared', s.calls.cleared.length === 1 && s.calls.cleared[0].channelId === CHANNEL)
		check('a toast names the chat', s.toasts().includes('Invite sent to #general'), s.toasts())
		check('the message has the usual defaults', sent.message.tts === false && Array.isArray(sent.message.invalidEmojis))
		s.restore()
	}
	{
		const s = await setup({ mine: null })
		await sendFrom(s, 'Send listen along')
		check('without Spotify playing the invite says so', s.toasts().includes('Play something on Spotify first.') && s.calls.sent.length === 0, s.toasts())
		s.restore()
	}
	{
		const s = await setup({ mine: activityOf(ME), channel: null })
		await sendFrom(s, 'Send listen along')
		check('without an open chat it asks to open one', s.toasts().includes('Open a chat first, then try again.') && s.calls.sent.length === 0, s.toasts())
		s.restore()
	}
	{
		const s = await setup({ mine: activityOf(ME), sender: false })
		await sendFrom(s, 'Send song link')
		check('without Discord\'s sender it asks to open a chat', s.toasts().includes('Open a chat first, then try again.'))
		s.restore()
	}
	{
		const s = await setup({ track: { id: 'trkA', album: { id: 'albA' } } })
		await sendFrom(s, 'Send song link')
		check('the song link is sent', s.calls.sent[0]?.message.content === 'https://open.spotify.com/track/trkA' && s.calls.sent[0].clearDraft === false, s.calls.sent)
		check('a toast says the song link was sent', s.toasts().includes('Song link sent'))
		await sendFrom(s, 'Send playing album')
		check('the album link is sent', s.calls.sent[1]?.message.content === 'https://open.spotify.com/album/albA', s.calls.sent)
		s.restore()
	}
	{
		const s = await setup({ mine: activityOf(ME, { metadata: { context_uri: 'spotify:album:fromContext1' } }) })
		await sendFrom(s, 'Send playing album')
		check('the album is found from the activity when the store has none', s.calls.sent[0]?.message.content === 'https://open.spotify.com/album/fromContext1', s.calls.sent)
		s.restore()
	}
	{
		const s = await setup({ mine: activityOf(ME, { metadata: {} }) })
		await sendFrom(s, 'Send playing album')
		check('without an album the person is told', s.toasts().includes('Could not find the album for this song.') && s.calls.sent.length === 0, s.toasts())
		s.restore()
	}
	{
		// Discord's store is empty but the presence shows Spotify playing.
		const s = await setup({ mine: null, presence: { [ME]: [activityOf(ME)] } })
		await sendFrom(s, 'Send listen along')
		check('your own presence is used when the Spotify store is empty', s.calls.sent.length === 1, s.toasts())
		s.restore()
	}

	// --- The Listen along button
	/** Loads a fake Play on Spotify button and returns what it draws once patched. */
	const playButton = async (s, name = 'SpotifyPlayButton') => {
		const module = { [name]: function Play() { return { type: 'PlayButton', props: {} } } }
		s.runtime.finders.loadModule(module)
		await sleep(10)
		return module[name]
	}
	{
		const s = await setup({ icon: true })
		const Play = await playButton(s)
		const other = activityOf(OTHER)
		const drawn = Play({ activity: other })
		check('the button is drawn beside Play on Spotify', typeof drawn.type === 'function' && drawn.props.activity === other)
		check('Discord\'s own button is kept', drawn.props.button.type === 'PlayButton')
		const view = s.runtime.mount(drawn)
		await view.settle()
		const control = findNode(view.tree, n => n.type === 'Design.IconButton')
		check('it is an icon button when Discord has the icon', !!control && control.props.accessibilityLabel === 'Listen along')
		check('the button is not dimmed when it can be used', control.props.style === undefined)
		check('Discord\'s own button is drawn next to it', !!findNode(view.tree, n => n.type === 'PlayButton'))
		s.restore()
	}
	{
		const s = await setup({ icon: false })
		const Play = await playButton(s, 'PlayOnSpotifyButton')
		const view = s.runtime.mount(Play({ activity: activityOf(OTHER) }))
		await view.settle()
		const control = findNode(view.tree, n => n.type === 'Design.Button')
		check('it is a text button when Discord has no icon', control && control.props.text === 'Along')
		s.restore()
	}
	{
		const s = await setup()
		const Play = await playButton(s)
		check('props without an activity leave the button alone', Play({}).type === 'PlayButton')
		check('the activity is found when it is the props themselves', typeof Play(activityOf(OTHER)).type === 'function')
		check('the activity is found inside a party object', typeof Play({ party: activityOf(OTHER) }).type === 'function')
		s.restore()
	}
	{
		const s = await setup({ saved: { listenAlong: false } })
		const Play = await playButton(s)
		check('with the switch off the button is left alone', Play({ activity: activityOf(OTHER) }).type === 'PlayButton')
		s.restore()
	}
	{
		// Class components and wrapped components are patched too.
		const s = await setup()
		class PlayClass {
			render() {
				return { type: 'PlayButton', props: {} }
			}
		}
		const moduleClass = { SpotifyPlayButton: PlayClass }
		s.runtime.finders.loadModule(moduleClass)
		const moduleMemo = { PlayOnSpotifyButton: { type: function Inner() { return { type: 'PlayButton', props: {} } } } }
		s.runtime.finders.loadModule(moduleMemo)
		const moduleRef = { PlayOnSpotifyButton: { render: function Inner() { return { type: 'PlayButton', props: {} } } } }
		s.runtime.finders.loadModule(moduleRef)
		await sleep(10)
		const instance = new PlayClass()
		instance.props = { activity: activityOf(OTHER) }
		check('a class component is patched', typeof instance.render().type === 'function')
		check('a memo component is patched', typeof moduleMemo.PlayOnSpotifyButton.type({ activity: activityOf(OTHER) }).type === 'function')
		check('a forwardRef component is patched', typeof moduleRef.PlayOnSpotifyButton.render({ activity: activityOf(OTHER) }).type === 'function')
		s.restore()
	}

	/** Mounts the button for an activity and presses it. */
	const pressButton = async (s, activity) => {
		const Play = await playButton(s)
		const view = s.runtime.mount(Play({ activity }))
		await view.settle()
		const control = findNode(view.tree, n => n.type === 'Design.Button')
		control.props.onPress()
		await sleep(20)
		await view.settle()
		return view
	}
	{
		const s = await setup({ mine: null })
		const view = await pressButton(s, activityOf(ME))
		check('you cannot listen along with yourself', s.toasts().includes('Listen along with someone else, not yourself.'), s.toasts())
		check('the button does not spin when it could not start', findNode(view.tree, n => n.type === 'Design.Button').props.loading === false)
		s.restore()
	}
	{
		const s = await setup({ mine: activityOf(OTHER) })
		await pressButton(s, activityOf(OTHER))
		check('you cannot join a session you are already in', s.toasts().includes("You're already along for this ride."), s.toasts())
		s.restore()
	}
	{
		// Discord's own controls, with Spotify already playing: just join.
		const s = await setup({ controls: true, mine: activityOf(ME) })
		const other = activityOf(OTHER)
		await pressButton(s, other)
		check('with Discord\'s controls and Spotify playing, the session is joined', s.calls.sync.length === 1 && s.calls.sync[0].userId === OTHER && s.calls.sync[0].activity === other && s.calls.play.length === 0, s.calls)
		check('a toast says it is listening along', s.toasts().includes('Listening along'))
		s.restore()
	}
	{
		// Discord's own controls, nothing playing yet: start Spotify, wait for the player, then join.
		const s = await setup({ controls: true, mine: null })
		const other = activityOf(OTHER)
		const Play = await playButton(s)
		const view = s.runtime.mount(Play({ activity: other }))
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.Button').props.onPress()
		await sleep(10)
		check('Spotify is started first', s.calls.play.length === 1 && s.calls.sync.length === 0, s.calls)
		s.runtime.fire('SPOTIFY_PLAYER_STATE', {})
		await sleep(20)
		check('then the session is joined when the player updates', s.calls.sync.length === 1, s.calls)
		s.restore()
	}
	{
		// No player update comes: it goes on after a short wait.
		const s = await setup({ controls: true, mine: null })
		await pressButton(s, activityOf(OTHER))
		await sleep(1400)
		check('it goes on even if the player never reports', s.calls.sync.length === 1, s.calls)
		s.restore()
	}

	// --- Without Discord's controls: Spotify's web API
	{
		const s = await setup({ controls: false })
		s.web.devices = [{ id: 'devA' }, { id: 'devB', is_active: true }, { id: 'devC', is_restricted: true }]
		const other = activityOf(OTHER)
		await pressButton(s, other)
		const play = s.calls.fetch.find(c => c.url.includes('/me/player/play'))
		check('the web API is used', !!play, s.calls.fetch.map(c => c.url))
		check('it plays on the active device', play.url === 'https://api.spotify.com/v1/me/player/play?device_id=devB', play.url)
		check('it signs in with the token Discord holds', play.init.headers.Authorization === 'Bearer tok')
		const body = JSON.parse(play.init.body)
		check('the track starts inside its album', body.context_uri === 'spotify:album:alb1234567890' && body.offset.uri === 'spotify:track:trk1', body)
		check('it starts at the other person\'s position', body.position_ms >= 4000 && body.position_ms < 15000, body.position_ms)
		check('a toast says it is listening along', s.toasts().includes('Listening along'))
		s.restore()
	}
	{
		const s = await setup({ controls: false })
		s.web.devices = []
		await pressButton(s, activityOf(OTHER))
		const play = s.calls.fetch.find(c => c.url.includes('/me/player/play'))
		check('with no devices listed the one Discord knows is used', play.url.endsWith('device_id=devDiscord'), play?.url)
		s.restore()
	}
	for (const [status, text] of [[401, 'Spotify sign-in expired. Open Spotify and try again.'], [403, 'Spotify Premium is needed to listen along.'], [404, 'No Spotify device found. Open Spotify on this phone first.'], [429, 'Spotify is busy. Try again in a moment.'], [500, 'Spotify said no (500).']]) {
		const s = await setup({ controls: false })
		s.web.playStatus = status
		await pressButton(s, activityOf(OTHER))
		check(`a ${status} from Spotify says "${text}"`, s.toasts().includes(text), s.toasts())
		s.restore()
	}
	{
		const s = await setup({ controls: false, socket: null })
		await pressButton(s, activityOf(OTHER))
		check('without a Spotify sign-in the person is told', s.toasts().includes('No Spotify sign-in found. Link Spotify in Discord and open the Spotify app.'), s.toasts())
		s.restore()
	}
	{
		// The token comes from the linked account when Discord's store has none.
		const urls = []
		const rest = {
			get: async ({ url }) => {
				urls.push(url)
				if (url === '/users/@me/connections') return { body: [{ type: 'spotify', id: 'acc1', revoked: true }, { type: 'spotify', id: 'acc2' }] }
				if (url === '/users/@me/connections/spotify/acc2/access-token') return { body: { access_token: 'fresh' } }
			},
			post() {},
			patch() {},
		}
		const s = await setup({ controls: false, socket: { device: { id: 'devDiscord' } }, rest })
		await pressButton(s, activityOf(OTHER))
		const play = s.calls.fetch.find(c => c.url.includes('/me/player/play'))
		check('a fresh token is asked for from the linked account', urls.includes('/users/@me/connections/spotify/acc2/access-token') && play?.init.headers.Authorization === 'Bearer fresh', urls)
		s.restore()
	}
	{
		const s = await setup({ controls: false })
		await pressButton(s, activityOf(OTHER, { sync_id: '' }))
		check('an activity without a track says so', s.toasts().includes('This activity has no track to play.'), s.toasts())
		s.restore()
	}
	{
		// The album is not in the activity: it is asked from Spotify.
		const s = await setup({ controls: false })
		s.web.track = { album: { uri: 'spotify:album:fromSpotify9' } }
		await pressButton(s, activityOf(OTHER, { metadata: {} }))
		const play = s.calls.fetch.find(c => c.url.includes('/me/player/play'))
		check('a missing album is looked up from Spotify', play && JSON.parse(play.init.body).context_uri === 'spotify:album:fromSpotify9', s.calls.fetch.map(c => c.url))
		s.restore()
	}
	{
		const s = await setup({ controls: false })
		await pressButton(s, activityOf(OTHER, { metadata: {} }))
		check('an album that cannot be found says so', s.toasts().includes('Could not find the album of that track.'), s.toasts())
		s.restore()
	}

	// --- Following the other person's songs
	{
		const s = await setup({ controls: true, mine: activityOf(ME) })
		const first = activityOf(OTHER)
		s.presenceMap[OTHER] = [first]
		await pressButton(s, first)
		await sleep(60)
		s.calls.play.length = 0
		s.calls.sync.length = 0
		// The same song: nothing happens.
		s.runtime.fire('PRESENCE_UPDATES', {})
		await sleep(100)
		check('the same song does not start again', s.calls.play.length === 0)
		// A new song.
		const next = activityOf(OTHER, { sync_id: 'trk2', details: 'Next', timestamps: { start: Date.now() } })
		s.presenceMap[OTHER] = [next]
		s.runtime.fire('PRESENCE_UPDATES', {})
		await sleep(100)
		check('a new song is played', s.calls.play.length === 1 && s.calls.play[0].activity === next && s.calls.play[0].userId === OTHER, s.calls.play)
		s.runtime.fire('SPOTIFY_PLAYER_STATE', {})
		await sleep(20)
		check('and the session is joined again', s.calls.sync.length === 1 && s.calls.sync[0].activity === next, s.calls.sync)
		await s.running.stop()
		s.presenceMap[OTHER] = [activityOf(OTHER, { sync_id: 'trk3' })]
		s.calls.play.length = 0
		s.runtime.fire('PRESENCE_UPDATES', {})
		await sleep(100)
		check('after stopping the plugin the songs are no longer followed', s.calls.play.length === 0)
		s.restore()
	}
	{
		// Without Discord's controls the next song is played through the web API.
		const s = await setup({ controls: false })
		const first = activityOf(OTHER)
		s.presenceMap[OTHER] = [first]
		await pressButton(s, first)
		s.calls.fetch.length = 0
		s.presenceMap[OTHER] = [activityOf(OTHER, { sync_id: 'trk2', details: 'Next' })]
		s.runtime.fire('PRESENCE_UPDATES', {})
		await sleep(150)
		const play = s.calls.fetch.find(c => c.url.includes('/me/player/play'))
		check('the next song is played through the web API when there are no controls', play && JSON.parse(play.init.body).offset.uri === 'spotify:track:trk2', s.calls.fetch.map(c => c.url))
		check('following the next song is quiet', s.toasts().filter(t => t === 'Listening along').length === 1, s.toasts())
		await s.running.stop()
		s.restore()
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
