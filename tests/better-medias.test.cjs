'use strict'

/**
 * Tests for Better Medias (the JavaScript half). Discord's video component, react-native-video, the voice message manager,
 * Discord's dispatcher, its native media player and the plugin's own native half are fakes; the tests check what the plugin
 * gives them and what it asks of them. Run with: node tests/better-medias.test.cjs (build first, or `bun run test`).
 */
const { createReporter, createRuntime, loadPlugin, startPlugin, findNodes, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Better Medias')

/** Sets up a fresh runtime with every fake this plugin talks to. */
function setup({ saved = {}, withNative = true } = {}) {
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
	const nativePlayer = { calls: [], playCurrentPlayer() { this.calls.push('play') }, pauseCurrentPlayer() { this.calls.push('pause') }, subscribeToPlaybackEvents() {} }

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
	return { runtime, storage, nativeCalls, sendAction, VideoComponent, RNVideo, seeks, dispatcher, manager, voiceCalls, nativePlayer, appState, emit }
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
		s.emit('MediaPlayerPlaybackRateChanged', { source: { id: 'm1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/song.mp3' }, rate: 1 })
		s.emit('MediaPlayerPlaybackProgressUpdated', { source: { id: 'm1', assetUrl: 'https://cdn.discordapp.com/attachments/1/2/song.mp3' }, time: 12, duration: 200 })
		await sleep(5)
		const u = updates(s).filter(x => x.target === 'native').at(-1)
		check('audio playing in a chat shows in the notification (no seek bar: Discord’s player cannot seek)', u && u.title === 'song.mp3' && u.playing === true && u.canSeek === false && u.durationMs === 200000, JSON.stringify(u))
		s.sendAction('pause:native')
		await sleep(5)
		check('pause from the notification pauses Discord’s player', s.nativePlayer.calls.includes('pause'))
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
