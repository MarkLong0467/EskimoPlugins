'use strict'

/**
 * Tests for Mute & Deafen Bubble (the JS half). Run with: node tests/voice-bubble.test.cjs
 * (build first: bun run build:dev voice-bubble, or just run `bun run test`).
 *
 * The native half (the floating bubble) is faked: `nextAction` hands out the taps a test queues, `setState` records
 * what the bubble would be told to show.
 */

const { createReporter, createRuntime, loadPlugin, startPlugin } = require('./lib/harness.cjs')

const { check, done } = createReporter('Mute & Deafen Bubble')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

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

async function setup({ inCall = true } = {}) {
	const state = { channel: inCall ? '123' : null, mute: false, deaf: false }
	const voice = store({ getVoiceChannelId: () => state.channel })
	const media = store({ isSelfMute: () => state.mute || state.deaf, isSelfDeaf: () => state.deaf })
	const calls = { setState: [], toggles: [] }
	const taps = []
	let waiter = null
	const audio = {
		toggleSelfMute: () => { calls.toggles.push('mute'); state.mute = !state.mute; if (!state.mute) state.deaf = false; media.emit() },
		toggleSelfDeaf: () => { calls.toggles.push('deaf'); state.deaf = !state.deaf; media.emit() },
	}
	const runtime = createRuntime({
		overrides: {
			discord: {
				flux: {
					getStore(name, callback) {
						const found = { SelectedVoiceChannelStore: voice, MediaEngineStore: media }[name]
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
							return new Promise(resolve => { waiter = resolve })
						}
						if (name === 'marklong.voicebubble.canDrawOverlays') return true
						return true
					},
				},
			},
		},
	}).install()
	runtime.finders.loadModule(audio)
	const { definition } = loadPlugin('voice-bubble')
	const plugin = await startPlugin(definition, runtime)
	await wait(5)
	/** Pretends the bubble was tapped. */
	const tap = action => { if (waiter) { const w = waiter; waiter = null; w(action) } else taps.push(action) }
	return { runtime, plugin, state, voice, media, calls, tap, definition, stopNative: () => tap('stop') }
}

;(async () => {
	await test('the bubble is told the call, mute and deafen state, enabled', async () => {
		const t = await setup()
		const last = t.calls.setState.at(-1)
		if (JSON.stringify(last) !== JSON.stringify([true, false, false, true])) throw new Error(JSON.stringify(t.calls.setState))
		await t.plugin.stop()
	})

	await test('tapping mute calls Discord\'s toggleSelfMute and the bubble shows muted', async () => {
		const t = await setup()
		t.tap('toggleMute')
		await wait(400)
		if (t.calls.toggles.join() !== 'mute') throw new Error(t.calls.toggles.join())
		const last = t.calls.setState.at(-1)
		if (JSON.stringify(last) !== JSON.stringify([true, true, false, true])) throw new Error(JSON.stringify(last))
		await t.plugin.stop()
	})

	await test('tapping deafen calls Discord\'s toggleSelfDeaf; the bubble shows deafened and muted', async () => {
		const t = await setup()
		t.tap('toggleDeaf')
		await wait(400)
		if (t.calls.toggles.join() !== 'deaf') throw new Error(t.calls.toggles.join())
		const last = t.calls.setState.at(-1)
		if (JSON.stringify(last) !== JSON.stringify([true, true, true, true])) throw new Error(JSON.stringify(last))
		t.tap('toggleDeaf')
		await wait(400)
		const after = t.calls.setState.at(-1)
		if (JSON.stringify(after) !== JSON.stringify([true, false, false, true])) throw new Error(JSON.stringify(after))
		await t.plugin.stop()
	})

	await test('several taps in a row are each handled', async () => {
		const t = await setup()
		t.tap('toggleMute'); t.tap('toggleDeaf'); t.tap('toggleDeaf')
		await wait(50)
		if (t.calls.toggles.join() !== 'mute,deaf,deaf') throw new Error(t.calls.toggles.join())
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
		if (JSON.stringify(last) !== JSON.stringify([false, false, false, false])) throw new Error(JSON.stringify(last))
		if (t.voice.listeners.size || t.media.listeners.size) throw new Error('listeners left behind')
		t.tap('toggleMute')
		await wait(400)
		if (t.calls.toggles.length) throw new Error('a tap after stopping still toggled')
	})

	done()
})()
