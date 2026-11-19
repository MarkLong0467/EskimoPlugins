'use strict'

/**
 * Tests for Better Medias (the JavaScript half). Discord's video component, react-native-video, the voice message manager,
 * Discord's dispatcher, its native media player and the plugin's own native half are fakes; the tests check what the plugin
 * gives them and what it asks of them. Run with: node tests/better-medias.test.cjs (build first, or `bun run test`).
 */
const { createReporter, createRuntime, loadPlugin, startPlugin, findNodes, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Better Medias')

/** Sets up a fresh runtime with every fake this plugin talks to. */
function setup({ saved = {}, withNative = true, withSwitch = false } = {}) {
	const nativeCalls = []
	let waiting = null
	const queued = []
	const callNativeMethod = (name, args) => {
		nativeCalls.push({ name: name.replace('marklong.bettermedias.', ''), args })
		if (!withNative) return Promise.reject(new Error('no native method'))
		if (name.endsWith('.nextAction')) {
			if (queued.length) return Promise.resolve(queued.shift())
			return new Promise(resolve => { waiting = resolve })
		}
		if (name.endsWith('.report')) return Promise.resolve('native: 0.1.0 (fake)')
		if (name.endsWith('.status')) return Promise.resolve(JSON.stringify({ version: '0.1.0', pip: 'supported by Discord’s window' }))
		return Promise.resolve(true)
	}
	/** The notification sends a command, as the native half would. */
	const sendAction = action => {
		if (waiting) {
			const resolve = waiting
			waiting = null
			resolve(action)
		} else queued.push(action)
	}

	const modulesByPath = {}
	const appListeners = []
	const emitterHandlers = {}
	const nativePlayer = { calls: [], playCurrentPlayer() { this.calls.push('play') }, pauseCurrentPlayer() { this.calls.push('pause') }, pauseAllMediaPlayers() { this.calls.push('pauseAll') }, subscribeToPlaybackEvents() {} }

	const runtime = createRuntime({
		overrides: {
			modules: { native: { callNativeMethod } },
			discord: {
				flux: { getStore: (name, callback) => { callback({ getVoiceChannelId: () => null }); return () => {} } },
				utils: {
					modules: {
						finders: {
							getModuleWithImportedPath(path, callback) {
								let active = true
								setImmediate(() => { if (active && modulesByPath[path]) callback(modulesByPath[path]) })
								return () => { active = false }
							},
						},
					},
				},
			},
			react: {
				ReactNative: {
					AppState: { currentState: 'active', addEventListener: (type, fn) => { appListeners.push(fn); return { remove() { appListeners.splice(appListeners.indexOf(fn), 1) } } } },
					NativeModules: { MediaPlayerManager: nativePlayer, AudioManagerModule: { setMode() {} } },
					NativeEventEmitter: class {
						addListener(type, fn) {
							;(emitterHandlers[type] ??= []).push(fn)
							return { remove() { emitterHandlers[type] = emitterHandlers[type].filter(f => f !== fn) } }
						}
					},
				},
			},
		},
	}).install()

	// Valenced's insteadJSX: `fn([type, props, key], jsx)` makes the element instead.
	const jsxRuntime = runtime.valenced.react.jsxRuntime
	jsxRuntime.insteadJSX = (type, fn) => {
		const rt = runtime.valenced.react.ReactJSXRuntime
		const undo = ['jsx', 'jsxs'].map(name => {
			const original = rt[name]
			rt[name] = (t, p, k) => (t === type ? fn([t, p, k], original) : original(t, p, k))
			return () => { rt[name] = original }
		})
		return () => undo.reverse().forEach(f => f())
	}

	// Discord's VideoComponent, and react-native-video's player (which hands its ref an instance with seek()).
	const seeks = []
	function VideoComponent() { return null }
	function RNVideo(props) {
		if (typeof props.ref === 'function') props.ref({ seek: s => seeks.push(s), setNativeProps() {} })
		return null
	}
	modulesByPath['components_native/common/Video.tsx'] = { VideoComponent }
	// Discord's newer video switch (its own native player or react-native-video, same props).
	function VideoSwitch(props) {
		if (typeof props.ref === 'function') props.ref({ seek: s => seeks.push(s), setNativeProps() {} })
		return null
	}
	if (withSwitch) modulesByPath['modules/media_playback/native/Video.tsx'] = { default: VideoSwitch }
	runtime.finders.loadModule({ default: RNVideo, TextTrackType: {}, FilterType: {}, DRMType: {} })

	// Discord's dispatcher and voice message manager.
	const dispatcher = {
		subs: {},
		subscribe(type, fn) { (this.subs[type] ??= []).push(fn) },
		unsubscribe(type, fn) { this.subs[type] = (this.subs[type] ?? []).filter(f => f !== fn) },
		dispatch(action) { for (const fn of this.subs[action.type] ?? []) fn(action) },
		isDispatching: () => false,
	}
	runtime.finders.loadModule({ default: dispatcher })
	const voiceCalls = []
	const manager = { handleAppStateChanged: action => voiceCalls.push(action.state) }
	dispatcher.subscribe('APP_STATE_UPDATE', manager.handleAppStateChanged)
	modulesByPath['modules/voice_messages/native/VoiceMessagesPlaybackManager.tsx'] = { default: manager }

	const storage = runtime.makeStorage({ ...saved })
	const appState = state => appListeners.slice().forEach(fn => fn(state))
	const emit = (type, payload) => (emitterHandlers[type] ?? []).forEach(fn => fn(payload))
	return { runtime, storage, nativeCalls, sendAction, VideoComponent, RNVideo, VideoSwitch, seeks, dispatcher, manager, voiceCalls, nativePlayer, appState, emit }
}

const calls = (s, name) => s.nativeCalls.filter(c => c.name === name)
const updates = s => calls(s, 'update').map(c => JSON.parse(c.args[0]))

/** Draws one video the way Discord's VideoComponent would draw react-native-video, mounted, and returns its parts. */
async function drawVideo(s, props) {
	const jsx = s.runtime.valenced.react.ReactJSXRuntime.jsx
	const element = jsx(s.RNVideo, { source: { uri: 'https://cdn.discordapp.com/attachments/1/2/clip.mp4?ex=1' }, muted: false, paused: false, ...props })
	const view = s.runtime.mount(element)
	await view.settle()
	const inner = () => findNodes(view.tree, n => n.type === s.RNVideo)[0] ?? findInner(view)
	return { element, view, inner }
}
/** The react-native-video element the wrapper drew (the fake renders nothing, so look at the wrapper's output). */
function findInner(view) {
	return view.tree
}

;(async () => {
	// --- Start: the settings go to the native half; every feature starts on
	{
		const s = setup()
		const { definition } = loadPlugin('better-medias')
		const running = await startPlugin(definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const config = calls(s, 'config')[0]
		const sent = config && JSON.parse(config.args[0])
		check('the settings are sent to the native half when it starts', !!sent)
		check('every feature starts on', sent && Object.values(sent).every(v => v === true) && Object.keys(sent).length === 7, JSON.stringify(sent))
		check('it starts listening for notification commands', calls(s, 'nextAction').length === 1)

		// --- 1. Discord's VideoComponent no longer pauses videos when the app is not active
		const jsx = s.runtime.valenced.react.ReactJSXRuntime.jsx
		const v = jsx(s.VideoComponent, { paused: false, source: { uri: 'x' } })
		check('videos: Discord’s video component is told not to pause when the app is not active', v.props.pauseWhileAppInactive === false && v.props.playInBackground === true)

		// --- 2. react-native-video is drawn with the background and side-by-side switches
		let given
		const Spy = props => { given = props; return null }
		const original = s.RNVideo
		const el = jsx(original, { source: { uri: 'https://cdn.discordapp.com/attachments/1/2/My%20clip.mp4?ex=1' }, muted: false, paused: false, onProgress: () => { given.__seenProgress = true } })
		check('react-native-video is wrapped so it can be followed', typeof el.type === 'function' && el.type !== original && el.props.__bmType === original)
		void Spy
		running.stop && (await running.stop())
	}

	// --- Videos, mounted: tracking, notification, commands, the small player
	{
		const s = setup()
		const { definition } = loadPlugin('better-medias')
		const running = await startPlugin(definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const jsx = s.runtime.valenced.react.ReactJSXRuntime.jsx
		let progress = null
		let drawn = null
		function Holder() {
			return jsx(s.RNVideo, {
				source: { uri: 'https://cdn.discordapp.com/attachments/1/2/My%20clip.mp4?ex=1' },
				muted: false,
				paused: false,
				onProgress: e => { progress = e },
			})
		}
		// Look inside: the wrapper draws react-native-video with createElement; capture what it is given.
		const realCreate = s.runtime.valenced.react.React.createElement
		s.runtime.valenced.react.React.createElement = (type, props, ...kids) => {
			if (type === s.RNVideo) drawn = props
			return realCreate(type, props, ...kids)
		}
		const view = s.runtime.mount(jsx(Holder, {}))
		await view.settle()
		check('the player is given playInBackground, playWhenInactive, disableFocus and mixWithOthers', drawn && drawn.playInBackground === true && drawn.playWhenInactive === true && drawn.disableFocus === true && drawn.mixWithOthers === 'mix', drawn && JSON.stringify({ a: drawn.playInBackground, b: drawn.playWhenInactive, c: drawn.disableFocus, d: drawn.mixWithOthers }))
		drawn.onLoad({ duration: 120, naturalSize: { width: 1280, height: 720 } })
		drawn.onProgress({ currentTime: 30, seekableDuration: 120 })
		check('Discord’s own onProgress still gets the progress', progress && progress.currentTime === 30)
		await sleep(5)
		const u = updates(s).at(-1)
		check('the notification gets the video: name, position, length, playing, can seek', u && u.target === 'video:1' && u.title === 'My clip.mp4' && u.positionMs === 30000 && u.durationMs === 120000 && u.playing === true && u.canSeek === true, JSON.stringify(u))
		const pip = calls(s, 'pip').at(-1)
		check('Picture-in-Picture is asked for while it plays, with the video’s shape', pip && pip.args[0] === true && pip.args[1] === 1280 && pip.args[2] === 720, pip && JSON.stringify(pip.args))

		// Commands from the notification
		s.sendAction('pause:video:1')
		await sleep(5)
		await view.settle()
		check('pause from the notification pauses the video', drawn.paused === true)
		s.sendAction('play:video:1')
		await sleep(5)
		await view.settle()
		check('play from the notification plays it again', drawn.paused === false)
		s.sendAction('seek:video:1:45000')
		await sleep(5)
		check('seek from the notification moves the video (in seconds)', s.seeks.at(-1) === 45, String(s.seeks))

		// Leaving it while it plays: the small player takes over from the same moment
		drawn.onProgress({ currentTime: 46, seekableDuration: 120 })
		view.unmount()
		await sleep(450)
		const mini = calls(s, 'miniOpen').at(-1)
		check('a video left while it plays carries on in the small player, from the same moment', mini && mini.args[0].includes('clip.mp4') && mini.args[1] === 46000 && mini.args[3] === true, mini && JSON.stringify(mini.args))
		check('and its own notification entry is cleared', calls(s, 'clear').some(c => c.args[0] === 'video:1'))
		s.runtime.valenced.react.React.createElement = realCreate
		await running.stop()
	}

	// --- A muted preview, or the switch off: no small player; switches off leave Discord's props alone
	{
		const s = setup({ saved: { crossChat: false, backgroundVideo: false, simultaneous: false } })
		const { definition } = loadPlugin('better-medias')
		const running = await startPlugin(definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const jsx = s.runtime.valenced.react.ReactJSXRuntime.jsx
		const v = jsx(s.VideoComponent, { paused: false })
		check('with Videos off, Discord’s video component is left as it is', v.props.pauseWhileAppInactive === undefined && v.props.playInBackground === undefined)
		let drawn = null
		const realCreate = s.runtime.valenced.react.React.createElement
		s.runtime.valenced.react.React.createElement = (type, props, ...kids) => { if (type === s.RNVideo) drawn = props; return realCreate(type, props, ...kids) }
		const view = s.runtime.mount(jsx(() => jsx(s.RNVideo, { source: { uri: 'https://x/a.mp4' }, muted: false, paused: false }), {}))
		await view.settle()
		check('with the switches off the player is not given background or side-by-side', drawn && !drawn.playInBackground && !drawn.playWhenInactive && !drawn.disableFocus && drawn.mixWithOthers === undefined)
		drawn.onLoad({ duration: 60 })
		drawn.onProgress({ currentTime: 5 })
		view.unmount()
		await sleep(450)
		check('with "across chats" off, nothing goes to the small player', calls(s, 'miniOpen').length === 0)
		s.runtime.valenced.react.React.createElement = realCreate
		await running.stop()

		const t = setup()
		const run2 = await startPlugin(loadPlugin('better-medias').definition, t.runtime, { storage: t.storage })
		await sleep(10)
		let d2 = null
		const rc2 = t.runtime.valenced.react.React.createElement
		t.runtime.valenced.react.React.createElement = (type, props, ...kids) => { if (type === t.RNVideo) d2 = props; return rc2(type, props, ...kids) }
		const jsx2 = t.runtime.valenced.react.ReactJSXRuntime.jsx
		const view2 = t.runtime.mount(jsx2(() => jsx2(t.RNVideo, { source: { uri: 'https://x/preview.mp4' }, muted: true, paused: false }), {}))
		await view2.settle()
		d2.onLoad({ duration: 10 })
		d2.onProgress({ currentTime: 3 })
		view2.unmount()
		await sleep(450)
		check('a muted preview never goes to the small player or the notification', calls(t, 'miniOpen').length === 0 && updates(t).length === 0)
		t.runtime.valenced.react.React.createElement = rc2
		await run2.stop()
	}

	// --- Two videos playing, Discord goes to the background: only the newest keeps playing
	{
		const s = setup()
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const jsx = s.runtime.valenced.react.ReactJSXRuntime.jsx
		const drawn = {}
		const realCreate = s.runtime.valenced.react.React.createElement
		s.runtime.valenced.react.React.createElement = (type, props, ...kids) => { if (type === s.RNVideo) drawn[props.source.uri] = props; return realCreate(type, props, ...kids) }
		function Two() {
			return [jsx(s.RNVideo, { key: 'a', source: { uri: 'https://x/a.mp4' }, muted: false, paused: false }), jsx(s.RNVideo, { key: 'b', source: { uri: 'https://x/b.mp4' }, muted: false, paused: false })]
		}
		const view = s.runtime.mount(jsx(Two, {}))
		await view.settle()
		drawn['https://x/a.mp4'].onProgress({ currentTime: 1 })
		await sleep(15)
		drawn['https://x/b.mp4'].onProgress({ currentTime: 1 })
		check('while Discord is open both play side by side', drawn['https://x/a.mp4'].paused === false && drawn['https://x/b.mp4'].paused === false)
		s.appState('background')
		await view.settle()
		check('when Discord goes to the background, the older one is paused and the newest keeps playing', drawn['https://x/a.mp4'].paused === true && drawn['https://x/b.mp4'].paused === false)
		s.appState('active')
		await view.settle()
		check('the paused one does not start again by itself', drawn['https://x/a.mp4'].paused === true)
		s.runtime.valenced.react.React.createElement = realCreate
		view.unmount()
		await running.stop()
	}

	// --- Voice messages: Discord's "pause when leaving" is skipped; everything else still reaches the manager
	{
		const s = setup()
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		s.dispatcher.dispatch({ type: 'APP_STATE_UPDATE', state: 'background' })
		check('voice messages: leaving Discord no longer reaches the voice message manager', !s.voiceCalls.includes('background'), String(s.voiceCalls))
		s.dispatcher.dispatch({ type: 'APP_STATE_UPDATE', state: 'active' })
		check('coming back still reaches it', s.voiceCalls.includes('active'))
		await s.storage.set({ backgroundVoice: false })
		s.dispatcher.dispatch({ type: 'APP_STATE_UPDATE', state: 'background' })
		check('with Voice messages off, Discord pauses them as before', s.voiceCalls.includes('background'))
		await running.stop()
		check('after the plugin stops, Discord’s own listener is back, alone', s.dispatcher.subs.APP_STATE_UPDATE.length === 1 && s.dispatcher.subs.APP_STATE_UPDATE[0] === s.manager.handleAppStateChanged)
	}

	// --- Discord's native player (media inside chats): notification and its play/pause
	{
		const s = setup()
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const song = { id: 'm1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/song.mp3' }
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: song, time: 12000, duration: 200000 })
		await sleep(5)
		const u = updates(s).filter(x => x.target === 'native').at(-1)
		check('audio playing in a chat shows in the notification, its times in milliseconds as Discord sends them', u && u.title === 'song.mp3' && u.playing === true && u.durationMs === 200000 && u.positionMs === 12000, JSON.stringify(u))
		s.sendAction('pause:native')
		await sleep(5)
		check('pause from the notification pauses Discord’s player', s.nativePlayer.calls.includes('pause'))
		check('the file it plays is told to the native half (to find the player to seek)', calls(s, 'nativeSource').some(c => /song\.mp3/.test(c.args[0])))

		// The phone's report: a 7 second voice message came as time 2734, duration 7125 (it showed 38:40 before).
		s.nativeCalls.length = 0
		const voice = { id: 'v1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/voice-message.ogg', isVoiceMessage: true }
		s.emit('MediaPlayerPlaybackSourceChanged', { source: voice })
		s.emit('MediaPlayerPlaybackRateChanged', { source: voice, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: voice, time: 2734, duration: 7125 })
		await sleep(2100)
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: voice, time: 4800, duration: 7125 })
		await sleep(5)
		const v = updates(s).filter(x => x.target === 'native').at(-1)
		check('a voice message shows its real length (7 s, not 1 h 58 min)', v && v.title === 'Voice message' && v.durationMs === 7125 && v.positionMs === 4800, JSON.stringify(v))
		const next = { id: 'm2', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/other.mp3' }
		s.emit('MediaPlayerPlaybackSourceChanged', { source: next })
		s.emit('MediaPlayerPlaybackRateChanged', { source: next, rate: 1 })
		await sleep(5)
		const n = updates(s).filter(x => x.target === 'native').at(-1)
		check('a new file does not keep the last one’s length', n && n.title === 'other.mp3' && n.durationMs === -1, JSON.stringify(n))
		await running.stop()
	}

	// --- Leaving Discord: Discord pauses its chat player a moment later; it is started again
	{
		const s = setup()
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const plays = () => s.nativePlayer.calls.filter(c => c === 'play').length
		const song = { id: 'm1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/song.flac' }
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: song, time: 8000, duration: 19000 })
		s.appState('background')
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 0 })
		check('an audio file playing when Discord is left is started again', plays() === 1, String(s.nativePlayer.calls))

		// Paused in the notification while away: stays paused.
		s.sendAction('pause:native')
		await sleep(5)
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 0 })
		check('pausing it from the notification is not undone', plays() === 1, String(s.nativePlayer.calls))

		// Coming back and leaving again with it paused: nothing starts.
		s.appState('active')
		await sleep(1600)
		s.appState('background')
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 0 })
		check('something that was paused when Discord was left stays paused', plays() === 1, String(s.nativePlayer.calls))
		s.appState('active')

		// The pause can come just before Discord says it left.
		await sleep(4100)
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 1 })
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 0 })
		s.appState('background')
		check('also when the pause comes just before Discord says it left', plays() === 2, String(s.nativePlayer.calls))
		s.appState('active')

		// With Audio files off, it pauses as Discord wants.
		await s.storage.set({ backgroundAudio: false })
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 1 })
		s.appState('background')
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 0 })
		check('with Audio files off it is not started again', plays() === 2, String(s.nativePlayer.calls))
		s.appState('active')
		await running.stop()
	}

	// --- Changing chats: Discord pauses every chat player; with "across chats" on it keeps playing
	{
		const s = setup()
		const original = s.nativePlayer.pauseAllMediaPlayers
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		s.nativePlayer.pauseAllMediaPlayers()
		check('opening another chat no longer pauses what plays', !s.nativePlayer.calls.includes('pauseAll'))
		await s.storage.set({ crossChat: false })
		s.nativePlayer.pauseAllMediaPlayers()
		check('with "across chats" off it pauses as before', s.nativePlayer.calls.includes('pauseAll'))
		await running.stop()
		check('after the plugin stops Discord’s own pause is back', s.nativePlayer.pauseAllMediaPlayers === original)
	}

	// --- A video playing in a chat asks for Picture-in-Picture
	{
		const s = setup()
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const clip = { id: 'c1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/clip.mp4?ex=1' }
		s.emit('MediaPlayerPlaybackRateChanged', { source: clip, rate: 1 })
		await sleep(5)
		const pip = calls(s, 'pip').at(-1)
		check('a video playing in a chat asks for Picture-in-Picture', pip && pip.args[0] === true && pip.args[4] === 'native', JSON.stringify(pip))
		s.emit('MediaPlayerPlaybackRateChanged', { source: clip, rate: 0 })
		await sleep(5)
		check('and lets it go when paused', calls(s, 'pip').at(-1).args[0] === false)
		const song = { id: 'm1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/song.mp3' }
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 1 })
		await sleep(5)
		check('an audio file does not ask for it', calls(s, 'pip').at(-1).args[0] === false)
		await running.stop()
	}

	// --- Discord's newer video switch (modules/media_playback/native/Video.tsx) is followed instead of react-native-video
	{
		const s = setup({ withSwitch: true })
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const jsx = s.runtime.valenced.react.ReactJSXRuntime.jsx
		const el = jsx(s.VideoSwitch, { source: { uri: 'https://cdn.discordapp.com/attachments/1/2/clip.mp4' }, muted: false, paused: false })
		check('Discord’s video switch is wrapped so its videos can be followed', el.props.__bmType === s.VideoSwitch, String(el.type && el.type.name))
		const inner = jsx(s.RNVideo, { source: { uri: 'x' } })
		check('react-native-video inside it is not wrapped a second time', inner.type === s.RNVideo)
		await running.stop()
	}

	// --- Seeking Discord's chat player: changeProgress(number, number). The phone said: "Expected argument 0 of method
	// changeProgress to be a number, but got a string". The numbers in the source id are tried, in s, ms and as a fraction.
	{
		const s = setup()
		const sent = []
		s.nativePlayer.changeProgress = (id, value) => {
			if (typeof id !== 'number') throw new Error('Exception in HostFunction: Expected argument 0 of method "changeProgress" to be a number, but got a string')
			sent.push(`${id} ${value}`)
		}
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const clip = { id: '1573063218341875735.0:1626432719', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/clip.mp4' }
		s.emit('MediaPlayerPlaybackRateChanged', { source: clip, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: clip, time: 1000, duration: 60000 })
		await sleep(5)
		check('the notification gets a seek bar for Discord’s chat player', updates(s).filter(x => x.target === 'native').at(-1).canSeek === true)
		s.sendAction('seek:native:30000')
		await sleep(5)
		check('a seek sends the number from the id, never the text id (seconds first)', sent[0] === '1626432719 30', String(sent))
		await sleep(1300)
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: clip, time: 2300, duration: 60000 })
		check('when the player did not move, milliseconds are tried', sent[1] === '1626432719 30000', String(sent))
		await sleep(300)
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: clip, time: 30200, duration: 60000 })
		sent.length = 0
		s.sendAction('seek:native:45000')
		await sleep(5)
		check('and the way that worked is used from then on', sent[0] === '1626432719 45000', String(sent))
		await running.stop()
	}

	// --- Several at once with two short audio clips: a 2 second voice message is carried on too
	{
		const s = setup()
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const voice = { id: 'v1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/voice-message.ogg', isVoiceMessage: true }
		const song = { id: 'm1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/01_.flac' }
		s.emit('MediaPlayerPlaybackRateChanged', { source: voice, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: voice, time: 600, duration: 2320 })
		s.emit('MediaPlayerPlaybackSourceChanged', { source: song })
		await sleep(5)
		const mini = calls(s, 'miniOpen').at(-1)
		check('audio + audio: a short voice message playing when a song starts carries on', mini && /voice-message/.test(mini.args[0]) && mini.args[2] === 'Voice message', JSON.stringify(mini))
		await running.stop()
	}

	// --- 0.3.0: a chat video carries on in the small player when you change chats; audio keeps playing in Discord's player
	{
		const s = setup()
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const clip = { id: 'c1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/clip.mp4?ex=1' }
		s.emit('MediaPlayerPlaybackRateChanged', { source: clip, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: clip, time: 5000, duration: 60000 })
		await sleep(5)
		const video = calls(s, 'nativeVideo').at(-1)
		check('the playing chat video is told to the native half (for Picture-in-Picture)', video && /clip\.mp4/.test(video.args[0]) && video.args[3] === true, JSON.stringify(video))
		s.nativePlayer.pauseAllMediaPlayers()
		await sleep(5)
		const mini = calls(s, 'miniOpen').at(-1)
		check('changing chats while a video plays opens it in the small player at the same moment', mini && /clip\.mp4/.test(mini.args[0]) && mini.args[1] === 5000, JSON.stringify(mini))
		check('and Discord’s own player is paused (no double sound)', s.nativePlayer.calls.includes('pause') && !s.nativePlayer.calls.includes('pauseAll'))
		await running.stop()
	}

	// --- 0.3.0: the native half took the video for Picture-in-Picture: Discord's player pauses and is not started again
	{
		const s = setup()
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const clip = { id: 'c1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/clip.mp4' }
		s.emit('MediaPlayerPlaybackRateChanged', { source: clip, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: clip, time: 5000, duration: 60000 })
		s.sendAction('handoff:native')
		await sleep(5)
		s.appState('background')
		s.emit('MediaPlayerPlaybackRateChanged', { source: clip, rate: 0 })
		check('hand-off to Picture-in-Picture pauses Discord’s player and it stays paused', s.nativePlayer.calls.includes('pause') && !s.nativePlayer.calls.includes('play'), String(s.nativePlayer.calls))
		await running.stop()
	}

	// --- 0.3.0: several at once: starting something else hands what played to the small player
	{
		const s = setup()
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const song = { id: 'm1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/song.mp3' }
		const voice = { id: 'v1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/voice-message.ogg', isVoiceMessage: true }
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: song, time: 20000, duration: 180000 })
		s.emit('MediaPlayerPlaybackSourceChanged', { source: voice })
		await sleep(5)
		const mini = calls(s, 'miniOpen').at(-1)
		check('a song playing when a voice message starts carries on in the small player', mini && /song\.mp3/.test(mini.args[0]) && mini.args[1] === 20000, JSON.stringify(mini))
		s.nativeCalls.length = 0
		const gif = { id: 'g1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/loop.mp4' }
		s.emit('MediaPlayerPlaybackRateChanged', { source: gif, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: gif, time: 500, duration: 2000 })
		s.emit('MediaPlayerPlaybackSourceChanged', { source: song })
		await sleep(5)
		check('a very short clip is not carried on', calls(s, 'miniOpen').length === 0)
		await s.storage.set({ simultaneous: false })
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: song, time: 20000, duration: 180000 })
		s.emit('MediaPlayerPlaybackSourceChanged', { source: voice })
		await sleep(5)
		check('with "Play several at once" off nothing is carried on', calls(s, 'miniOpen').length === 0)
		await running.stop()
	}

	// --- 0.9.0: no notification for a kind of media that is not kept playing in the background
	{
		const s = setup({ saved: { backgroundVideo: false } })
		const running = await startPlugin(loadPlugin('better-medias').definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const clip = { id: 'c1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/clip.mp4' }
		s.emit('MediaPlayerPlaybackRateChanged', { source: clip, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: clip, time: 1000, duration: 51504 })
		await sleep(5)
		check('with Videos off, a chat video gets no notification', updates(s).filter(x => x.target === 'native').length === 0 && calls(s, 'clear').some(c => c.args[0] === 'native'))
		const song = { id: 'm1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/song.mp3' }
		s.emit('MediaPlayerPlaybackSourceChanged', { source: song })
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 1 })
		await sleep(5)
		check('while an audio file (Audio files on) still gets one', updates(s).some(x => x.target === 'native' && x.title === 'song.mp3'))
		await s.storage.set({ backgroundAudio: false })
		s.nativeCalls.length = 0
		s.emit('MediaPlayerPlaybackRateChanged', { source: song, rate: 0 })
		await sleep(5)
		check('turning Audio files off takes its notification away', updates(s).length === 0 && calls(s, 'clear').some(c => c.args[0] === 'native'))
		await running.stop()
	}

	// --- Settings screen and report
	{
		const s = setup()
		const { definition } = loadPlugin('better-medias')
		const running = await startPlugin(definition, s.runtime, { storage: s.storage })
		await sleep(10)
		const view = s.runtime.mount(s.runtime.React.createElement(definition.SettingsComponent, {}))
		await view.settle()
		await sleep(5)
		await view.settle()
		const switches = findNodes(view.tree, n => n.type === 'Design.TableSwitchRow')
		const labels = switches.map(n => n.props.label)
		check('settings: a switch for each feature', ['Videos', 'Audio files', 'Voice messages', 'Play several at once', 'Keep videos playing across chats', 'Notification controls', 'Picture-in-Picture'].every(l => labels.includes(l)), labels.join('|'))
		const pipRow = switches.find(n => n.props.label === 'Picture-in-Picture')
		pipRow.props.onValueChange(false)
		await sleep(5)
		const last = JSON.parse(calls(s, 'config').at(-1).args[0])
		check('turning a switch off saves it and tells the native half', s.storage.cache.pictureInPicture === false && last.pictureInPicture === false)
		const status = findNodes(view.tree, n => n.type === 'Design.TableRow' && /Native part/.test(n.props.label))[0]
		check('the status row says the native part loaded', status && status.props.label === 'Native part loaded', status && status.props.label)
		const copy = findNodes(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Copy report')[0]
		let copied = ''
		s.runtime.valenced.externals.ReactNativeClipboard.Clipboard.setString = text => { copied = text }
		copy.props.onPress()
		await sleep(10)
		check('Copy report copies what the JavaScript and native halves found', /Better Medias report/.test(copied) && /VideoComponent/.test(copied) && /native: 0\.1\.0/.test(copied) && /MediaPlayerManager/.test(copied), copied.slice(0, 300))
		await running.stop()
	}

	// --- Without the native half the plugin still starts and says so
	{
		const s = setup({ withNative: false })
		const { definition } = loadPlugin('better-medias')
		let threw = null
		let running
		try {
			running = await startPlugin(definition, s.runtime, { storage: s.storage })
			await sleep(10)
		} catch (error) {
			threw = error
		}
		check('without the native half it starts without an error', !threw && running.errors.length === 0, threw && threw.message)
		const view = s.runtime.mount(s.runtime.React.createElement(definition.SettingsComponent, {}))
		await view.settle(); await sleep(5); await view.settle()
		const status = findNodes(view.tree, n => n.type === 'Design.TableRow' && /Native part/.test(n.props.label))[0]
		check('and its settings say the native part is not loaded', status && status.props.label === 'Native part not loaded')
		await running.stop()
	}

	done()
})()
