'use strict'

/**
 * Tests for Call Battery Saver. Run with: node tests/call-battery-saver.test.cjs
 * (build first: bun run build:dev call-battery-saver, or just run `bun run test`).
 *
 * Discord's voice side is faked after the decompiled app: a `Connection` class whose setters pass transport options to
 * the "voice engine" (recorded in `engine.options`), `MediaEngineStore.getMediaEngine().eachConnection`, the voice state
 * store with people's cameras, and the channel actions that leave a call. The clock and the plugin's interval are fake.
 */

const fs = require('node:fs')
const path = require('node:path')
const { createReporter, createRuntime, loadPlugin, findNode, findNodes, textOf, ROOT } = require('./lib/harness.cjs')

const { check, done } = createReporter('Call Battery Saver')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const MINUTE = 60_000

const realNow = Date.now
const clock = { now: realNow() }
Date.now = () => clock.now

/** A Flux-like store with change listeners. */
function fluxStore(methods) {
	const listeners = new Set()
	return {
		...methods,
		addChangeListener: fn => listeners.add(fn),
		removeChangeListener: fn => listeners.delete(fn),
		emit: () => {
			for (const fn of [...listeners]) fn()
		},
		listeners,
	}
}

async function setup({ saved = {}, inCall = true, mute = false, deaf = false, cameras = {}, disabled = {} } = {}) {
	// The voice engine: every transport option set, in order, and the latest value of each.
	const engine = { calls: [], options: {} }
	const setTransportOptions = o => {
		engine.calls.push(o)
		Object.assign(engine.options, o)
	}
	class Connection {
		constructor() {
			this.context = 'default'
			this.echoCancellation = true
			this.noiseSuppression = false
			this.noiseCancellation = true
			this.automaticGainControl = { enabled: true, mode: 'adaptive' }
		}
		setSkipNoiseCancellationIfMuted(enabled) {
			setTransportOptions({ skipNoiseCancellationIfMuted: enabled })
		}
		setEchoCancellation(v) {
			this.echoCancellation = v
			setTransportOptions({ echoCancellation: v })
		}
		setNoiseSuppression(v) {
			this.noiseSuppression = v
			setTransportOptions({ noiseSuppression: v })
		}
		setNoiseCancellation(v) {
			this.noiseCancellation = v
			setTransportOptions({ noiseCancellation: v })
		}
		setAutomaticGainControl(v) {
			this.automaticGainControl = v
			setTransportOptions({ automaticGainControl: v.enabled, automaticGainControlConfig: v })
		}
	}
	const state = { channel: inCall ? 'vc1' : null, mute, deaf, cameras: { ...cameras }, disabled: { ...disabled }, connections: inCall ? [new Connection()] : [] }
	const stream = new Connection()
	stream.context = 'stream'
	const media = fluxStore({
		isSelfMute: () => state.mute || state.deaf,
		isSelfDeaf: () => state.deaf,
		isLocalVideoDisabled: id => !!state.disabled[id],
		getMediaEngine: () => ({ eachConnection: cb => [...state.connections, stream].forEach(cb) }),
	})
	const voice = fluxStore({ getVoiceChannelId: () => state.channel })
	const voiceStates = fluxStore({
		getVoiceStatesForChannel: id =>
			id === state.channel
				? Object.fromEntries(['me', 'u1', 'u2', 'u3'].map(u => [u, { userId: u, selfVideo: !!state.cameras[u] }]))
				: {},
	})
	/** Discord's reducer for the video toggle: what the plugin dispatches changes `disabled`. */
	const onDispatch = action => {
		if (action.type === 'AUDIO_SET_LOCAL_VIDEO_DISABLED') {
			state.disabled[action.userId] = action.videoToggleState === 'DISABLED'
		}
	}
	const channelActions = {
		disconnects: 0,
		selectVoiceChannel(id) {
			state.channel = id
			state.connections = id ? state.connections : []
			voice.emit()
		},
		disconnect() {
			this.disconnects++
			this.selectVoiceChannel(null)
		},
	}

	const intervals = []
	const realSetInterval = globalThis.setInterval
	globalThis.setInterval = fn => {
		intervals.push(fn)
		return intervals.length
	}
	const runtime = createRuntime({
		stores: { UserStore: { getCurrentUser: () => ({ id: 'me' }) } },
		overrides: {
			discord: {
				flux: {
					getStore(name, callback) {
						const found = { MediaEngineStore: media, SelectedVoiceChannelStore: voice, VoiceStateStore: voiceStates }[name]
						if (found) callback(found)
						return () => {}
					},
				},
				common: { flux: { Dispatcher: { dispatch: a => { runtime.log.dispatched.push(a); onDispatch(a) } } } },
			},
		},
	}).install()
	runtime.valenced.modules.finders.loadModule(channelActions)
	const { definition } = loadPlugin('call-battery-saver')
	const storage = runtime.makeStorage({ ...saved })
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'call-battery-saver', 'manifest.json'), 'utf8'))
	const cleanups = []
	const errors = []
	const plugin = { manifest: { ...manifest, version: { nums: [0, 1, 0] } }, errors, reportError: e => errors.push(e), requireReload() {}, startedLate: false }
	const api = { cleanup: (...fns) => cleanups.push(...fns), decorate() {}, jsonStorage: storage, logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, plugin, unscoped: runtime.valenced }
	plugin.api = api
	await definition.start.call(plugin, { ...api, plugin })
	globalThis.setInterval = realSetInterval
	await wait(60)

	/** Changes the call like Discord does, then lets the plugin's debounce run. */
	const change = async fn => {
		fn(state)
		media.emit()
		voice.emit()
		voiceStates.emit()
		await wait(60)
	}
	const look = (time = clock.now) => {
		clock.now = time
		for (const fn of intervals) fn()
	}
	const stop = () => {
		for (const cleanup of [...cleanups].reverse()) if (typeof cleanup === 'function') cleanup()
	}
	const videoActions = () => runtime.log.dispatched.filter(a => a.type === 'AUDIO_SET_LOCAL_VIDEO_DISABLED')
	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	const mountSettings = async () => {
		const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api }))
		await view.settle()
		return view
	}
	return { runtime, engine, state, media, voice, Connection, conn: () => state.connections[0], stream, channelActions, storage, errors, change, look, stop, videoActions, toasts, mountSettings }
}

;(async () => {
	// --- Skip Krisp while muted (on by default)
	{
		const s = await setup()
		check('the skip option is turned on in the call', s.engine.options.skipNoiseCancellationIfMuted === true, s.engine.calls)
		// Discord's updateConnectionMuteDeaf asks for `experiment && muted`, which is false while the experiment is off.
		s.conn().setSkipNoiseCancellationIfMuted(false)
		check('Discord asking for false still gets true', s.engine.options.skipNoiseCancellationIfMuted === true)
		await s.change(st => {
			st.mute = true
		})
		check('muting leaves the rest of the processing alone by default', s.engine.options.echoCancellation === undefined && s.conn().noiseCancellation === true)
		check('no camera is touched while only muted', s.videoActions().length === 0)
		check('a Go Live stream connection is never touched', s.stream.echoCancellation === true && s.stream.noiseCancellation === true)

		await s.storage.set({ skipKrisp: false })
		await wait(60)
		check('turning the setting off asks for false again', s.engine.options.skipNoiseCancellationIfMuted === false)
		s.conn().setSkipNoiseCancellationIfMuted(true)
		check('and Discord’s own value goes through', s.engine.options.skipNoiseCancellationIfMuted === true)
		s.stop()
		check('no errors', s.errors.length === 0, s.errors)
	}

	// --- Pause all processing while muted
	{
		const s = await setup({ saved: { pauseProcessing: true } })
		await s.change(st => {
			st.mute = true
		})
		const c = s.conn()
		check('muting turns echo cancellation off', s.engine.options.echoCancellation === false && c.echoCancellation === false)
		check('and Krisp', s.engine.options.noiseCancellation === false)
		check('and gain control, keeping its config', s.engine.options.automaticGainControl === false && c.automaticGainControl.mode === 'adaptive')

		// Discord applies a setting change while the processing is paused (the user changed echo cancellation in Discord).
		c.setEchoCancellation(false)
		c.setNoiseCancellation(true)
		check('Discord’s change while paused is not applied yet', s.engine.options.noiseCancellation === false)

		await s.change(st => {
			st.mute = false
		})
		check('unmuting puts Krisp back', s.engine.options.noiseCancellation === true && c.noiseCancellation === true)
		check('gain control comes back with its config', s.engine.options.automaticGainControl === true && c.automaticGainControl.enabled === true && c.automaticGainControl.mode === 'adaptive')
		check('the echo cancellation Discord asked for while paused is what comes back', s.engine.options.echoCancellation === false && c.echoCancellation === false)
		check('noise suppression stays as it was (off)', c.noiseSuppression === false)

		c.setEchoCancellation(true)
		check('after unmuting Discord’s setters work as usual', s.engine.options.echoCancellation === true)

		await s.change(st => {
			st.mute = true
		})
		check('muting again pauses again', s.engine.options.echoCancellation === false)
		s.stop()
		check('stopping the plugin while muted puts everything back', s.engine.options.echoCancellation === true && s.engine.options.noiseCancellation === true && c.automaticGainControl.enabled === true)
		check('and gives the skip option back to Discord', s.engine.options.skipNoiseCancellationIfMuted === false)
		c.setEchoCancellation(false)
		check('and unpatches the setters', s.engine.options.echoCancellation === false)
	}
	{
		const s = await setup({ saved: { pauseProcessing: true }, mute: true })
		check('already muted when the plugin starts: paused at once', s.engine.options.echoCancellation === false)
		await s.storage.set({ pauseProcessing: false })
		await wait(60)
		check('turning the setting off resumes at once', s.engine.options.echoCancellation === true && s.engine.options.noiseCancellation === true)
		s.stop()
	}
	{
		const s = await setup({ saved: { pauseProcessing: true }, inCall: false, mute: true })
		check('muted outside a call: nothing to do', s.engine.calls.length === 0, s.engine.calls)
		s.stop()
	}

	// --- Cameras while deafened
	{
		const s = await setup({ cameras: { me: true, u1: true, u2: true }, disabled: { u2: true } })
		await s.change(st => {
			st.deaf = true
		})
		const paused = s.videoActions().filter(a => a.videoToggleState === 'DISABLED').map(a => a.userId)
		check('deafening pauses the cameras that are on', paused.includes('u1'), paused)
		check('not your own', !paused.includes('me'))
		check('not one you turned off yourself', !paused.includes('u2'))
		check('not someone with no camera', !paused.includes('u3'))
		check('the toggle is automatic and not saved', s.videoActions().every(a => a.isAutomatic === true && a.persist === false && a.context === 'default'))

		await s.change(st => {
			st.cameras.u3 = true
		})
		check('someone turning their camera on while you are deafened is paused too', s.state.disabled.u3 === true)
		const before = s.videoActions().length
		await s.change(() => {})
		check('a change that is not about cameras does not dispatch again', s.videoActions().length === before)

		await s.change(st => {
			st.deaf = false
		})
		const shown = s.videoActions().filter(a => a.videoToggleState === 'AUTO_ENABLED').map(a => a.userId).sort()
		check('undeafening shows them again', shown.join() === 'u1,u3', shown)
		check('the one you turned off yourself stays off', s.state.disabled.u2 === true)
		s.stop()
	}
	{
		const s = await setup({ cameras: { u1: true } })
		await s.change(st => {
			st.deaf = true
		})
		await s.change(st => {
			st.disabled.u1 = false // you turned it back on yourself
			st.deaf = false
		})
		check('a camera you turned back on yourself is not dispatched again', s.videoActions().filter(a => a.videoToggleState === 'AUTO_ENABLED').length === 0)
		s.stop()
	}
	{
		const s = await setup({ cameras: { u1: true }, saved: { pauseVideo: false } })
		await s.change(st => {
			st.deaf = true
		})
		check('with the setting off cameras are left alone', s.videoActions().length === 0)
		s.stop()
	}
	{
		const s = await setup({ cameras: { u1: true } })
		await s.change(st => {
			st.deaf = true
		})
		s.stop()
		check('stopping the plugin while deafened shows the cameras again', s.state.disabled.u1 === false)
	}

	// --- Timers
	{
		clock.now = realNow()
		const start = clock.now
		const s = await setup({ saved: { remindMinutes: 30, leaveMinutes: 60 } })
		await s.change(st => {
			st.mute = true
		})
		s.look(start + 45 * MINUTE)
		check('muted only does not count by default', s.toasts().length === 0 && s.channelActions.disconnects === 0)
		await s.change(st => {
			st.deaf = true
		})
		const deafAt = clock.now
		s.look(deafAt + 29 * MINUTE)
		check('no reminder before 30 minutes', s.toasts().length === 0)
		s.look(deafAt + 31 * MINUTE)
		check('a reminder after 30 minutes deafened', s.toasts().some(t => /deafened in a call for 30 minutes/.test(t)), s.toasts())
		s.look(deafAt + 40 * MINUTE)
		check('only one reminder', s.toasts().filter(t => /deafened in a call/.test(t)).length === 1)
		s.look(deafAt + 61 * MINUTE)
		check('leaves the call after an hour', s.channelActions.disconnects === 1)
		check('and says so', s.toasts().some(t => /Left the call after 1 hour deafened/.test(t)), s.toasts())
		s.stop()
	}
	{
		const start = clock.now
		const s = await setup({ saved: { remindMinutes: 15, timerWhen: 'muted' } })
		await s.change(st => {
			st.mute = true
		})
		s.look(start + 10 * MINUTE)
		await s.change(st => {
			st.mute = false
		})
		await s.change(st => {
			st.mute = true
		})
		const again = clock.now
		s.look(again + 10 * MINUTE)
		check('unmuting resets the timer', s.toasts().length === 0, s.toasts())
		s.look(again + 16 * MINUTE)
		check('counting while muted works when asked', s.toasts().some(t => /muted in a call for 15 minutes/.test(t)), s.toasts())
		s.stop()
	}
	{
		const s = await setup({ deaf: true })
		s.look(clock.now + 500 * MINUTE)
		check('with the timers off nothing happens', s.toasts().length === 0 && s.channelActions.disconnects === 0)
		s.stop()
	}

	// --- Joining a call later
	{
		const s = await setup({ inCall: false, saved: { pauseProcessing: true } })
		await s.change(st => {
			st.channel = 'vc1'
			st.connections = [new s.Connection()]
			st.mute = true
		})
		check('joining a call muted pauses its connection', s.conn().echoCancellation === false)
		check('and turns the skip option on', s.engine.options.skipNoiseCancellationIfMuted === true)
		s.stop()
	}

	// --- Settings screen
	{
		const s = await setup()
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		const switches = findNodes(view.tree, n => n.type === 'Design.TableSwitchRow').map(n => n.props.label)
		check('the settings show every switch', ['Skip Krisp while muted', 'Pause all mic processing while muted', 'Pause other people’s cameras', 'Count while muted too'].every(l => switches.includes(l)), switches)
		const remind = findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Remind me after')
		check('the reminder row starts Off', remind?.props.subLabel === 'Off')
		remind.props.onPress()
		await view.settle()
		check('tapping it picks 15 minutes', s.storage.cache.remindMinutes === 15, s.storage.cache)
		const leaveRow = () => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Leave the call after')
		for (let i = 0; i < 8; i++) {
			leaveRow().props.onPress()
			await view.settle()
		}
		check('the leave row goes round to Off', s.storage.cache.leaveMinutes === 0, s.storage.cache.leaveMinutes)
		check('the screen explains what it does', /mic keeps recording/.test(text))
		check('it has the debugging section', findNode(view.tree, n => typeof n.type === 'function' && /Debug/.test(n.type.name || '')) !== undefined || /Copy logs|Debugging/.test(text))
		s.stop()
	}

	Date.now = realNow
	done()
})()
