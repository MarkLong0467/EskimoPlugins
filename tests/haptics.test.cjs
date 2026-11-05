'use strict'

/**
 * Tests for Haptics. Run with: node tests/haptics.test.cjs
 * (build first: bun run build:dev haptics, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, sleep, findNode, findNodes, textOf } = require('./lib/harness.cjs')

const { check, done } = createReporter('Haptics')

// The plugin looks for Discord's menu opener a second time after 4 seconds. The tests do not wait that long.
const realSetTimeout = globalThis.setTimeout
const timers = []
globalThis.setTimeout = (fn, ms, ...rest) => {
	timers.push(ms)
	return realSetTimeout(fn, ms === 4000 ? 15 : ms, ...rest)
}

// A clock the tests control, so "at most one log line every 5 seconds" can be checked.
let now = 1_000_000
Date.now = () => now

/**
 * Sets up a fake Discord with the haptic pieces the plugin looks for, starts the plugin, and renders its settings.
 * `menuOpener: false` leaves Discord's menu opener out, as it is when it has not loaded yet.
 */
async function setup({ saved = {}, menuOpener = true, natives = {}, vibration = true, nativeThrows = false } = {}) {
	const calls = { openLazy: [], vibrate: [], copied: [] }
	const actionSheet = menuOpener ? { openLazy: (...args) => (calls.openLazy.push(args), 'opened') } : {}
	const runtime = createRuntime({
		overrides: {
			externals: { ReactNativeClipboard: { Clipboard: { setString: text => calls.copied.push(text) } } },
		},
	}).install()
	// A plain object, so it really has no `openLazy` when Discord has not loaded the menu opener yet.
	runtime.valenced.discord.actions.ActionSheetActionCreators = actionSheet
	// React Native's native modules and Vibration API, set directly so the test holds the very objects the plugin patches.
	const reactNative = runtime.valenced.react.ReactNative
	reactNative.NativeModules = nativeThrows ? new Proxy({}, { get: () => { throw new Error('boom') } }) : natives
	reactNative.Vibration = vibration ? { vibrate: (...args) => (calls.vibrate.push(args), 'vibrated') } : undefined
	const { definition } = loadPlugin('haptics')
	const storage = runtime.makeStorage(saved)
	const running = await startPlugin(definition, runtime, { storage })

	const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api: { jsonStorage: storage } }))
	await view.settle()
	const rows = () => findNodes(view.tree, node => node.type === 'Design.TableRow')
	const row = label => rows().find(node => node.props.label === label)
	const switches = () => findNodes(view.tree, node => node.type === 'Design.TableSwitchRow')
	const toasts = () => runtime.log.actions.filter(action => action.label === 'toast').map(action => action.args[1].text)
	/** The rows under "Buzzes just now" and "What this found": label to sub label. */
	const refresh = () => view.settle()
	return { runtime, running, definition, storage, view, rows, row, switches, toasts, calls, actionSheet, refresh, reactNative }
}

;(async () => {
	// --- What the screen shows at the start
	{
		const s = await setup()
		check('the three switches are listed in order, all on by default', s.switches().map(row => `${row.props.label}:${row.props.value}`).join('|') === 'Buzz when a menu opens:true|Other haptic feedback:true|Vibrations:true', s.switches().map(row => row.props.label))
		check('with the menu opener and vibrations found, the screen says so', s.row('Menus').props.subLabel === 'working' && s.row('Vibrations').props.subLabel === 'working', s.rows().map(row => [row.props.label, row.props.subLabel]))
		check('and that no haptic library has been found yet', s.row('Haptic libraries').props.subLabel === 'none found')
		check('nothing has buzzed yet', s.row('Nothing yet') !== undefined)
	}

	// --- Menus
	{
		const s = await setup()
		const options = { other: 1 }
		const result = s.actionSheet.openLazy('sheet', 'key', options)
		check('with the menu buzz on, a menu is opened exactly as Discord would', s.calls.openLazy.length === 1 && s.calls.openLazy[0][2] === options && !('disableHapticOnOpen' in options) && result === 'opened')
	}
	{
		const s = await setup({ saved: { menus: false } })
		const options = { other: 1 }
		const result = s.actionSheet.openLazy('sheet', 'key', options)
		const passed = s.calls.openLazy[0][2]
		check('with the menu buzz off, the buzz-free option is added', passed.disableHapticOnOpen === true, passed)
		check('the other options are kept, and the caller\'s own object is not changed', passed.other === 1 && !('disableHapticOnOpen' in options))
		check('and the menu still opens, with the result passed on', result === 'opened' && s.calls.openLazy[0][0] === 'sheet' && s.calls.openLazy[0][1] === 'key')
		s.actionSheet.openLazy('sheet', 'key')
		check('a menu opened with no options at all also gets the option', s.calls.openLazy[1][2].disableHapticOnOpen === true)
		await s.refresh()
		check('the screen lists the menu buzz as removed', s.row('Menu opened')?.props.subLabel === 'buzz removed · 2x', s.rows().map(row => [row.props.label, row.props.subLabel]))
	}
	{
		const s = await setup()
		await s.storage.set({ menus: false })
		s.actionSheet.openLazy('a', 'b', {})
		check('turning the switch off takes effect straight away', s.calls.openLazy[0][2].disableHapticOnOpen === true)
		await s.storage.set({ menus: true })
		s.actionSheet.openLazy('a', 'b', {})
		check('and turning it back on does too', !('disableHapticOnOpen' in s.calls.openLazy[1][2]))
	}

	// --- Haptic libraries (expo style)
	for (const [label, wrap] of [['on the module', module => module], ['on the default export', module => ({ default: module })]]) {
		const impact = []
		const library = { impactAsync: async style => (impact.push(style), 'impact'), notificationAsync: async () => 'notified', selectionAsync: async () => 'selected' }
		const s = await setup()
		s.runtime.finders.loadModule(wrap(library))
		await sleep(10)
		await s.refresh()
		check(`a haptics library found ${label} is reported`, s.row('Haptic libraries').props.subLabel === 'haptics (impact, notification, selection)', s.row('Haptic libraries').props.subLabel)
		const allowed = await library.impactAsync('medium')
		check(`with the switch on, its calls go through (${label})`, allowed === 'impact' && impact[0] === 'medium')
		await s.storage.set({ discord: false })
		const swallowed = await library.impactAsync('heavy')
		check(`with the switch off, the call is swallowed and still resolves (${label})`, swallowed === undefined && impact.length === 1)
		check(`all three functions are swallowed (${label})`, (await library.notificationAsync('x')) === undefined && (await library.selectionAsync()) === undefined)
		await s.refresh()
		check(`the screen names each buzz with its first argument (${label})`, !!s.row('haptics.impactAsync(medium)') && s.row('haptics.impactAsync(heavy)')?.props.subLabel === 'swallowed · 1x', s.rows().map(row => row.props.label))
	}

	// --- Haptic feedback library (trigger style)
	{
		const fired = []
		const library = { trigger: (...args) => (fired.push(args), 'fired'), HapticFeedbackTypes: {} }
		library.default = { trigger: (...args) => (fired.push(['default', ...args]), 'fired-default') }
		const s = await setup()
		s.runtime.finders.loadModule(library)
		await sleep(10)
		await s.refresh()
		check('a haptic feedback library is reported', s.row('Haptic libraries').props.subLabel === 'haptic feedback (trigger)', s.row('Haptic libraries').props.subLabel)
		check('its calls go through while the switch is on', library.trigger('impactLight') === 'fired' && library.default.trigger('selection') === 'fired-default')
		await s.storage.set({ discord: false })
		const before = fired.length
		check('and are swallowed, returning nothing, when it is off (module and default export)', library.trigger('impactLight') === undefined && library.default.trigger('selection') === undefined && fired.length === before)
	}

	// --- Native modules
	{
		const nativeCalls = []
		const natives = {
			RNHapticFeedback: { trigger: (...args) => (nativeCalls.push(args), 'rn') },
			ExpoHaptics: { impactAsync: async (...args) => (nativeCalls.push(args), 'expo'), notificationAsync: async () => 'n', selectionAsync: async () => 's', unrelated: () => 'u' },
		}
		const s = await setup({ natives })
		check('native haptic modules are found by name and reported', s.row('Haptic libraries').props.subLabel === 'RNHapticFeedback, ExpoHaptics', s.row('Haptic libraries').props.subLabel)
		check('their calls go through while the switch is on', natives.RNHapticFeedback.trigger('x') === 'rn' && (await natives.ExpoHaptics.impactAsync('y')) === 'expo')
		await s.storage.set({ discord: false })
		check('and are swallowed when it is off', natives.RNHapticFeedback.trigger('x') === undefined && (await natives.ExpoHaptics.impactAsync('y')) === undefined && nativeCalls.length === 2)
		check('other functions on a native module are left alone', natives.ExpoHaptics.unrelated() === 'u')
	}
	{
		const s = await setup({ nativeThrows: true })
		await s.refresh()
		s.row('Copy the log').props.onPress()
		check('a failure while looking for native modules is logged and the rest still works', s.calls.copied[0]?.includes('looking for native haptics failed: boom') && s.row('Menus').props.subLabel === 'working' && s.row('Vibrations').props.subLabel === 'working', s.calls.copied[0])
	}

	// --- Vibrations
	{
		const s = await setup()
		check('with vibrations on, a vibration goes through', s.reactNative.Vibration.vibrate(200) === 'vibrated' && s.calls.vibrate[0][0] === 200)
		await s.storage.set({ vibration: false })
		check('with vibrations off, it is swallowed', s.reactNative.Vibration.vibrate(200) === undefined && s.calls.vibrate.length === 1)
		await s.refresh()
		check('the screen lists it', s.row('Vibration')?.props.subLabel === 'swallowed · 1x' || s.rows().some(row => row.props.label === 'Vibration'))
	}
	{
		const s = await setup({ vibration: false })
		check('when vibrations cannot be found, the screen says so', s.row('Vibrations').props.subLabel === 'not found')
	}

	// --- The switches do not affect each other
	{
		const s = await setup({ saved: { menus: false } })
		check('turning the menu buzz off leaves vibrations alone', s.reactNative.Vibration.vibrate(1) === 'vibrated')
	}

	// --- The log and the list
	{
		const s = await setup()
		now = 2_000_000
		const first = s.actionSheet.openLazy
		first('a', 'b', {})
		for (let i = 0; i < 5; i++) first('a', 'b', {})
		s.row // keep the renderer happy
		await s.refresh()
		s.row('Copy the log').props.onPress()
		let lines = s.calls.copied.at(-1).split('\n').filter(line => line.includes('buzz: Menu opened'))
		check('the same buzz many times in a row is written to the log once', lines.length === 1 && lines[0].includes('(1x so far)'), lines)
		check('and counted in the list', s.row('Menu opened').props.subLabel === 'buzz kept · 6x', s.row('Menu opened')?.props.subLabel)
		now += 5001
		first('a', 'b', {})
		await s.refresh()
		s.row('Copy the log').props.onPress()
		lines = s.calls.copied.at(-1).split('\n').filter(line => line.includes('buzz: Menu opened'))
		check('after 5 seconds it is written again, with the running count', lines.length === 2 && lines[1].includes('(7x so far)'), lines)
		check('log lines start with the time (HH:MM:SS)', /^\d\d:\d\d:\d\d /.test(s.calls.copied.at(-1).split('\n')[0]))
		check('copying the log says so in a toast', s.toasts().includes('Log copied'), s.toasts())
	}
	{
		const s = await setup()
		const library = { impactAsync: async () => {}, notificationAsync: async () => {}, selectionAsync: async () => {} }
		s.runtime.finders.loadModule(library)
		await sleep(10)
		for (let i = 0; i < 100; i++) await library.impactAsync(`style-${i}`)
		await s.refresh()
		s.row('Copy the log').props.onPress()
		check('the log keeps only the last 60 lines', s.calls.copied.at(-1).split('\n').length === 60, s.calls.copied.at(-1).split('\n').length)
		check('and the newest line is the last buzz', s.calls.copied.at(-1).split('\n').at(-1).includes('style-99'))
		const listed = s.rows().filter(row => /^haptics\.impactAsync\(style-/.test(row.props.label))
		check('the list on the screen shows at most 12 buzzes, newest first', listed.length === 12 && listed[0].props.label === 'haptics.impactAsync(style-99)', listed.map(row => row.props.label))
	}
	{
		const s = await setup()
		const library = { impactAsync: async () => {}, notificationAsync: async () => {}, selectionAsync: async () => {} }
		s.runtime.finders.loadModule(library)
		await sleep(10)
		for (let i = 0; i < 40; i++) await library.impactAsync(`n-${i}`)
		await s.refresh()
		s.row('Clear the list').props.onPress()
		await s.refresh()
		check('"Clear the list" empties the list of buzzes', s.row('Nothing yet') !== undefined && !s.rows().some(row => /impactAsync/.test(row.props.label)))
	}
	{
		const s = await setup()
		const library = { impactAsync: async () => {}, notificationAsync: async () => {}, selectionAsync: async () => {} }
		s.runtime.finders.loadModule(library)
		await sleep(10)
		await library.impactAsync({ a: 1 }, 5, 'third')
		await library.impactAsync('only')
		await s.refresh()
		check('arguments are shown as text or by type, and only the first two', !!s.row('haptics.impactAsync(object, 5)') && !!s.row('haptics.impactAsync(only)'), s.rows().map(row => row.props.label))
	}

	// --- Looking for Discord's menu opener a second time
	{
		timers.length = 0
		const s = await setup({ menuOpener: false })
		check('without the menu opener the screen says it is not found yet', s.row('Menus').props.subLabel === 'not found yet')
		check('and a second look is scheduled after 4 seconds', timers.includes(4000), timers)
		s.actionSheet.openLazy = (...args) => (s.calls.openLazy.push(args), 'late')
		await sleep(60)
		await s.refresh()
		check('when the opener has loaded by then, it is hooked', s.row('Menus').props.subLabel === 'working')
		await s.storage.set({ menus: false })
		s.actionSheet.openLazy('a', 'b', {})
		check('and then removes the buzz like any other', s.calls.openLazy.at(-1)[2].disableHapticOnOpen === true)
	}
	{
		timers.length = 0
		const s = await setup({ menuOpener: false })
		await sleep(60)
		await s.refresh()
		s.row('Copy the log').props.onPress()
		const lines = s.calls.copied.at(-1).split('\n').filter(line => line.includes('menu opener was not found yet'))
		check('if it has not loaded after the second look, that is logged again and the screen still says not found', lines.length === 2 && s.row('Menus').props.subLabel === 'not found yet', lines)
	}
	{
		timers.length = 0
		await setup()
		check('when the opener is found at once, no second look is scheduled', !timers.includes(4000), timers)
	}

	// --- Stopping
	{
		const s = await setup({ menuOpener: false })
		await s.running.stop()
		await sleep(60)
		check('stopping before the second look cancels it', s.row('Menus').props.subLabel === 'not found yet')
	}
	{
		const library = { impactAsync: async () => 'impact', notificationAsync: async () => {}, selectionAsync: async () => {} }
		const s = await setup()
		s.runtime.finders.loadModule(library)
		await sleep(10)
		const patchedImpact = library.impactAsync
		const patchedVibrate = s.reactNative.Vibration.vibrate
		const patchedOpen = s.actionSheet.openLazy
		await s.running.stop()
		check('stopping gives back Discord\'s own haptic functions', library.impactAsync !== patchedImpact && s.reactNative.Vibration.vibrate !== patchedVibrate && s.actionSheet.openLazy !== patchedOpen)
		await s.storage.set({ discord: false, vibration: false, menus: false })
		check('and after that nothing is swallowed any more', (await library.impactAsync()) === 'impact' && s.reactNative.Vibration.vibrate(1) === 'vibrated')
		check('and no module subscription is left behind', s.runtime.finders.activeSubscriptions() === 0)
	}

	// --- The settings switches save
	{
		const s = await setup()
		s.switches()[1].props.onValueChange(false)
		await sleep(5)
		check('turning a switch off saves it', s.storage.cache.discord === false, s.storage.cache)
		await s.refresh()
		check('and the switch shows the new value', s.switches()[1].props.value === false)
		check('the screen explains the switches and what it cannot do', textOf(s.view.tree).includes('Turn a switch off to stop that buzz') && textOf(s.view.tree).includes('touch feedback of your phone itself'))
	}

	done()
})().catch(error => {
	console.error('CRASH', error)
	process.exit(2)
})
