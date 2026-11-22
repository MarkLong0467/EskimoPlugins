'use strict'

/**
 * Tests for Mute & Deafen Bubble (the JS half). Run with: node tests/voice-bubble.test.cjs
 * (build first: bun run build:dev voice-bubble, or just run `bun run test`).
 *
 * The native half (the floating bubble) is faked: `nextAction` hands out the taps a test queues, `setState` records
 * what the bubble would be told to show.
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes } = require('./lib/harness.cjs')

const { check, done } = createReporter('Mute & Deafen Bubble')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const ALL = 'mute,deafen,screenshare,disconnect'

/** Runs one async test: it passes when it finishes without throwing. */
async function test(name, fn) {
	try {
		await fn()
		check(name, true)
	} catch (error) {
		check(name, false, String(error && error.message || error))
	}
}

/** A Flux-like store with change listeners. */
function store(methods) {
	const listeners = new Set()
	return {
		...methods,
		addChangeListener: fn => listeners.add(fn),
		removeChangeListener: fn => listeners.delete(fn),
		emit: () => { for (const fn of [...listeners]) fn() },
		listeners,
	}
}

async function setup({ inCall = true, instant = false, lastError = '' } = {}) {
	const state = { channel: inCall ? '123' : null, mute: false, deaf: false, sharing: false }
	const voice = store({ getVoiceChannelId: () => state.channel })
	const media = store({ isSelfMute: () => state.mute || state.deaf, isSelfDeaf: () => state.deaf })
	const streaming = store({ getCurrentUserActiveStream: () => (state.sharing ? { state: 'ACTIVE' } : null) })
	const calls = { setState: [], toggles: [], shares: [], disconnects: 0 }
	const taps = []
	let waiter = null
	const audio = {
		toggleSelfMute: () => { calls.toggles.push('mute'); state.mute = !state.mute; if (!state.mute) state.deaf = false; media.emit() },
		toggleSelfDeaf: () => { calls.toggles.push('deaf'); state.deaf = !state.deaf; media.emit() },
	}
	// Discord's screen share functions (useScreenshareUtils), its channel actions and its channel store.
	const screenshare = {
		startStream: () => { calls.shares.push('startStream'); state.sharing = true; streaming.emit() },
		tryStartScreenShare: channel => { calls.shares.push('try:' + channel.id); state.sharing = true; streaming.emit() },
		stopScreenshare: () => { calls.shares.push('stop'); state.sharing = false; streaming.emit() },
	}
	const channelActions = {
		selectVoiceChannel: id => { if (id == null) { state.channel = null; voice.emit() } },
		disconnect() { calls.disconnects++; this.selectVoiceChannel(null) },
	}
	const channels = { getChannel: id => ({ id }), getDMFromUserId: () => null }
	const runtime = createRuntime({
		overrides: {
			discord: {
				flux: {
					getStore(name, callback) {
						const found = { SelectedVoiceChannelStore: voice, MediaEngineStore: media, ApplicationStreamingStore: streaming }[name]
						if (found) callback(found)
						return () => {}
					},
				},
			},
			modules: {
				native: {
					async callNativeMethod(name, args) {
						if (name === 'marklong.voicebubble.setState') { calls.setState.push(args); return true }
						if (name === 'marklong.voicebubble.nextAction') {
							if (taps.length) return taps.shift()
							// 0.3.1's native half answers at once ("none" when nothing was tapped).
							if (instant) return 'none'
							return new Promise(resolve => { waiter = resolve })
						}
						if (name === 'marklong.voicebubble.canDrawOverlays') return true
						if (name === 'marklong.voicebubble.lastError') return lastError
						return true
					},
				},
			},
		},
	}).install()
	runtime.finders.loadModule(audio)
	runtime.finders.loadModule(screenshare)
	runtime.finders.loadModule(channelActions)
	runtime.finders.loadModule(channels)
	const { definition } = loadPlugin('voice-bubble')
	const plugin = await startPlugin(definition, runtime)
	await wait(5)
	/** Pretends the bubble was tapped. */
	const tap = action => { if (waiter) { const w = waiter; waiter = null; w(action) } else taps.push(action) }
	return { runtime, plugin, state, voice, media, streaming, calls, tap, definition }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** The Buttons group's switch rows in a rendered settings tree. */
const buttonRows = tree => {
	const group = findNode(tree, node => node.type === 'Design.TableRowGroup' && node.props.title === 'Buttons')
	if (!group) throw new Error('no Buttons group')
	return findNodes(group, node => node.type === 'Design.TableSwitchRow')
}

;(async () => {
	await test('the bubble is told the call, mute, deafen and share state, enabled, and all four buttons', async () => {
		const t = await setup()
		const last = t.calls.setState.at(-1)
		if (!same(last, [true, false, false, true, ALL, false])) throw new Error(JSON.stringify(t.calls.setState))
		await t.plugin.stop()
	})

	await test('tapping mute calls Discord\'s toggleSelfMute and the bubble shows muted', async () => {
		const t = await setup()
		t.tap('toggleMute')
		await wait(400)
		if (t.calls.toggles.join() !== 'mute') throw new Error(t.calls.toggles.join())
		const last = t.calls.setState.at(-1)
		if (!same(last, [true, true, false, true, ALL, false])) throw new Error(JSON.stringify(last))
		await t.plugin.stop()
	})

	await test('tapping deafen calls Discord\'s toggleSelfDeaf; the bubble shows deafened and muted', async () => {
		const t = await setup()
		t.tap('toggleDeaf')
		await wait(400)
		if (t.calls.toggles.join() !== 'deaf') throw new Error(t.calls.toggles.join())
		const last = t.calls.setState.at(-1)
		if (!same(last, [true, true, true, true, ALL, false])) throw new Error(JSON.stringify(last))
		t.tap('toggleDeaf')
		await wait(400)
		const after = t.calls.setState.at(-1)
		if (!same(after, [true, false, false, true, ALL, false])) throw new Error(JSON.stringify(after))
		await t.plugin.stop()
	})

	await test('several taps in a row are each handled', async () => {
		const t = await setup()
		t.tap('toggleMute'); t.tap('toggleDeaf'); t.tap('toggleDeaf')
		await wait(50)
		if (t.calls.toggles.join() !== 'mute,deaf,deaf') throw new Error(t.calls.toggles.join())
		await t.plugin.stop()
	})

	await test('tapping screen share starts sharing in the call\'s channel, and tapping again stops it', async () => {
		const t = await setup()
		t.tap('startShare')
		await wait(400)
		if (t.calls.shares.join() !== 'try:123') throw new Error(t.calls.shares.join())
		if (t.calls.setState.at(-1)[5] !== true) throw new Error(JSON.stringify(t.calls.setState.at(-1)))
		t.tap('stopShare')
		await wait(400)
		if (t.calls.shares.join() !== 'try:123,stop') throw new Error(t.calls.shares.join())
		if (t.calls.setState.at(-1)[5] !== false) throw new Error(JSON.stringify(t.calls.setState.at(-1)))
		await t.plugin.stop()
	})

	await test('a share started from Discord itself shows on the bubble', async () => {
		const t = await setup()
		t.state.sharing = true
		t.streaming.emit()
		if (t.calls.setState.at(-1)[5] !== true) throw new Error(JSON.stringify(t.calls.setState.at(-1)))
		await t.plugin.stop()
	})

	await test('tapping disconnect leaves the call with Discord\'s disconnect, and the bubble is told', async () => {
		const t = await setup()
		t.tap('disconnect')
		await wait(400)
		if (t.calls.disconnects !== 1) throw new Error('disconnect called ' + t.calls.disconnects + ' times')
		if (t.calls.setState.at(-1)[0] !== false) throw new Error(JSON.stringify(t.calls.setState.at(-1)))
		await t.plugin.stop()
	})

	await test('leaving the call tells the bubble so', async () => {
		const t = await setup()
		t.state.channel = null
		t.voice.emit()
		const last = t.calls.setState.at(-1)
		if (last[0] !== false) throw new Error(JSON.stringify(last))
		await t.plugin.stop()
	})

	await test('the switch turns the bubble off', async () => {
		const t = await setup()
		await t.plugin.storage.set({ enabled: false })
		await wait(5)
		const last = t.calls.setState.at(-1)
		if (last[3] !== false) throw new Error(JSON.stringify(last))
		await t.plugin.stop()
	})

	await test('stopping hides the bubble and removes the store listeners', async () => {
		const t = await setup()
		await t.plugin.stop()
		const last = t.calls.setState.at(-1)
		if (!same(last, [false, false, false, false, 'mute,deafen', false])) throw new Error(JSON.stringify(last))
		if (t.voice.listeners.size || t.media.listeners.size || t.streaming.listeners.size) throw new Error('listeners left behind')
		t.tap('toggleMute')
		await wait(400)
		if (t.calls.toggles.length) throw new Error('a tap after stopping still toggled')
	})

	await test('the button switches choose what the bubble shows, top to bottom', async () => {
		const t = await setup()
		const cases = [
			[{ show: { screenshare: false } }, 'mute,deafen,disconnect'],
			[{ show: { mute: false, disconnect: false } }, 'deafen'],
			[{ show: { mute: true, deafen: false, screenshare: true } }, 'mute,screenshare'],
		]
		for (const [change, expected] of cases) {
			await t.plugin.storage.set(change)
			await wait(5)
			const last = t.calls.setState.at(-1)
			if (last[4] !== expected) throw new Error(JSON.stringify(change) + ': ' + JSON.stringify(last))
		}
		await t.plugin.stop()
	})

	await test('every switch off still leaves mute and deafen', async () => {
		const t = await setup()
		await t.plugin.storage.set({ show: { mute: false, deafen: false, screenshare: false, disconnect: false } })
		await wait(5)
		if (t.calls.setState.at(-1)[4] !== 'mute,deafen') throw new Error(JSON.stringify(t.calls.setState.at(-1)))
		await t.plugin.stop()
	})

	await test('a 0.2 choice carries over (mute only, deafen only), with the new buttons on', async () => {
		const cases = [
			['mute', 'mute,screenshare,disconnect'],
			['deafen', 'deafen,screenshare,disconnect'],
			['both', ALL],
			['nonsense', ALL],
		]
		for (const [old, expected] of cases) {
			const t = await setup()
			await t.plugin.storage.set({ buttons: old })
			await wait(5)
			if (t.calls.setState.at(-1)[4] !== expected) throw new Error(old + ': ' + JSON.stringify(t.calls.setState.at(-1)))
			await t.plugin.stop()
		}
	})

	await test('the settings page has a switch per button; flipping one saves it and tells the bubble', async () => {
		const t = await setup()
		const view = t.runtime.mount(t.runtime.React.createElement(t.definition.SettingsComponent))
		const rows = buttonRows(await view.settle())
		const shown = rows.map(row => row.props.label + '=' + row.props.value).join()
		if (shown !== 'Mute=true,Deafen=true,Screen share=true,Disconnect=true') throw new Error(shown)
		rows.find(row => row.props.label === 'Screen share').props.onValueChange(false)
		await wait(5)
		const saved = t.plugin.storage.cache.show
		if (!saved || saved.screenshare !== false || saved.mute !== true) throw new Error(JSON.stringify(saved))
		if (t.calls.setState.at(-1)[4] !== 'mute,deafen,disconnect') throw new Error('bubble not told: ' + JSON.stringify(t.calls.setState.at(-1)))
		const after = buttonRows(await view.settle())
		if (after.find(row => row.props.label === 'Screen share').props.value !== false) throw new Error('the switch shown did not change')
		view.unmount()
		await t.plugin.stop()
	})

	await test('the last button left on cannot be switched off', async () => {
		const t = await setup()
		await t.plugin.storage.set({ show: { mute: true, deafen: false, screenshare: false, disconnect: false } })
		const view = t.runtime.mount(t.runtime.React.createElement(t.definition.SettingsComponent))
		const mute = buttonRows(await view.settle()).find(row => row.props.label === 'Mute')
		if (!mute || mute.props.disabled !== true) throw new Error('mute switch not locked: ' + JSON.stringify(mute && mute.props.disabled))
		mute.props.onValueChange(false)
		await wait(5)
		if (t.plugin.storage.cache.show.mute !== true) throw new Error('the last button was turned off')
		view.unmount()
		await t.plugin.stop()
	})

	await test('with a native half that answers at once, a tap during a call still mutes within a moment', async () => {
		const t = await setup({ instant: true })
		t.tap('toggleMute')
		await wait(400)
		if (t.calls.toggles.join() !== 'mute') throw new Error(JSON.stringify(t.calls.toggles))
		await t.plugin.stop()
	})

	await test("a store that throws does not throw out of Discord's change listener", async () => {
		const t = await setup()
		t.media.isSelfDeaf = () => { throw new Error('boom') }
		t.media.emit()
		t.media.isSelfDeaf = () => false
		t.media.emit()
		await wait(5)
		await t.plugin.stop()
	})

	await test('a native error shows in the settings with a copy button; none, no group', async () => {
		const clean = await setup()
		const v1 = clean.runtime.mount(clean.runtime.React.createElement(clean.definition.SettingsComponent))
		if (findNode(await v1.settle(), node => node.props && node.props.title === 'Last error')) throw new Error('shown without an error')
		v1.unmount()
		await clean.plugin.stop()
		const t = await setup({ lastError: 'show: java.lang.RuntimeException: x\n  at a.b' })
		const view = t.runtime.mount(t.runtime.React.createElement(t.definition.SettingsComponent))
		const tree = await view.settle()
		const group = findNode(tree, node => node.props && node.props.title === 'Last error')
		if (!group) throw new Error('no Last error group')
		const row = findNode(group, node => node.props && node.props.label === 'Copy error report')
		if (!row || row.props.subLabel !== 'show: java.lang.RuntimeException: x') throw new Error(JSON.stringify(row && row.props.subLabel))
		view.unmount()
		await t.plugin.stop()
	})

	done()
})()
