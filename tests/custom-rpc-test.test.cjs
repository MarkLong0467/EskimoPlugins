'use strict'

/**
 * Tests for CustomRPC Test. Run with: node tests/custom-rpc-test.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, textOf, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('CustomRPC Test')

// The plugin waits 3 seconds after Discord reconnects and 0.4 seconds between profiles. The tests do not need to wait that long.
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...rest) => (ms === 3000 ? setImmediate(fn, ...rest) : ms === 400 ? realSetTimeout(fn, 5, ...rest) : realSetTimeout(fn, ms, ...rest))

const PREFIX = 'EskimoCustomRpcTest:'

/** A profile with the given fields over a blank one. It is switched on unless the fields say otherwise. */
const prof = (id, fields = {}) => ({
	id,
	label: id.toUpperCase(),
	enabled: true,
	name: `Game ${id}`,
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

/** A fake Discord with the plugin running and the given profiles saved. */
async function setup({ profiles = [prof('a')], settings = {}, user = { username: 'chase', globalName: 'Chase' }, vars = null } = {}) {
	const saved = { enabled: true, applyOnStart: true, refreshSeconds: '0', maxActive: '3', editing: profiles[0].id, profiles, ...settings }
	const runtime = createRuntime({ stores: { UserStore: { getCurrentUser: () => user } } }).install()
	delete globalThis.eskimoVars
	delete globalThis.eskimoTimestamps
	if (vars) globalThis.eskimoVars = vars
	const { definition } = loadPlugin('custom-rpc-test')
	const storage = runtime.makeStorage(saved)
	const running = await startPlugin(definition, runtime, { storage })
	await sleep(80)
	const activities = () => runtime.log.dispatched.filter(a => a.type === 'LOCAL_ACTIVITY_UPDATE')
	/** What was sent for one profile, oldest first. */
	const sent = id => activities().filter(a => a.socketId === `${PREFIX}${id}`)
	const lastOf = id => sent(id).at(-1)
	/** The profiles that currently have a presence (their last message is not a removal). */
	const live = () => [...new Set(activities().map(a => a.socketId))].filter(socket => activities().filter(a => a.socketId === socket).at(-1).activity !== null).map(socket => socket.slice(PREFIX.length))
	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	const settingsView = async () => {
		const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api: { jsonStorage: storage } }))
		await view.settle()
		return view
	}
	const restore = async () => {
		await running.stop()
	}
	return { runtime, running, definition, storage, activities, sent, lastOf, live, toasts, settingsView, restore }
}

const switchOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === label)
const rowOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
const inputOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TextInput' && n.props.label === label)

;(async () => {
	// --- One profile works as in Rich Presence
	{
		const s = await setup({ profiles: [prof('a', { name: 'My game', type: 2, details: 'Level {seconds}', state: 'for {user}', applicationId: ' 123 ' })] })
		const a = s.lastOf('a').activity
		check('a profile is sent as a game would report it, under its own socket', s.sent('a').length === 1 && s.lastOf('a').socketId === 'EskimoCustomRpcTest:a')
		check('its process number is its own', s.lastOf('a').pid === 4200)
		check('the sockets and process are not Rich Presence’s', s.lastOf('a').socketId !== 'EskimoRichPresence' && s.lastOf('a').pid !== 1337)
		check('the name, type and application are sent', a.name === 'My game' && a.type === 2 && a.application_id === '123' && a.flags === 1, a)
		check('variables are filled in', /^Level \d\d$/.test(a.details) && a.state === 'for Chase', a)
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { name: '' })] })
		check('a profile with no name sends a removal and nothing shows', s.activities().length === 1 && s.lastOf('a').activity === null)
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a')], settings: { applyOnStart: false } })
		check('with "apply on start" off nothing is sent at start', s.activities().length === 0)
		await s.restore()
	}

	// --- Several at once
	{
		const s = await setup({ profiles: [prof('a', { type: 0 }), prof('b', { type: 2 }), prof('c', { type: 3 })] })
		check('every profile that is on is sent', s.live().sort().join() === 'a,b,c', s.live())
		check('each one has its own socket', new Set(s.activities().map(a => a.socketId)).size === 3)
		check('each one has its own process number', new Set(s.activities().map(a => a.pid)).size === 3 && s.activities().every(a => a.pid >= 4200))
		check('each carries its own activity', s.lastOf('a').activity.name === 'Game a' && s.lastOf('b').activity.name === 'Game b' && s.lastOf('c').activity.type === 3)
		check('they are sent one after another, in the order of the list', s.activities().map(a => a.socketId.slice(PREFIX.length)).join() === 'a,b,c', s.activities().map(a => a.socketId))
		await s.restore()
		check('stopping the plugin removes every presence', s.live().length === 0, s.live())
		check('and sends a removal to each socket', ['a', 'b', 'c'].every(id => s.lastOf(id).activity === null))
	}

	// --- The limit
	{
		const s = await setup({ profiles: [prof('a'), prof('b'), prof('c'), prof('d')], settings: { maxActive: '2' } })
		check('only as many as the limit are shown, the first ones in the list', s.live().sort().join() === 'a,b', s.live())
		check('the ones over the limit are not sent at all', s.sent('c').length === 0 && s.sent('d').length === 0)
		const view = await s.settingsView()
		check('the screen says which are over the limit', switchOf(view, 'C').props.subLabel.includes('over the limit') && switchOf(view, 'A').props.subLabel === 'Shown on your profile', switchOf(view, 'C').props.subLabel)
		check('and keeps their switch on', switchOf(view, 'C').props.value === true)
		check('the heading counts them', textOf(view.tree).includes('Showing now (2 of up to 2)'), textOf(view.tree).slice(0, 400))
		inputOf(view, 'Most presences at once').props.onChange('3')
		await view.settle()
		await sleep(900)
		check('raising the limit shows one more', s.live().sort().join() === 'a,b,c', s.live())
		view.unmount()
		await s.restore()
	}
	for (const [typed, shown] of [['9', 5], ['0', 1], ['abc', 3], ['', 3], ['1', 1]]) {
		const s = await setup({ profiles: [prof('a'), prof('b'), prof('c'), prof('d'), prof('e'), prof('f')], settings: { maxActive: typed } })
		check(`a limit typed as "${typed}" allows ${shown}`, s.live().length === shown, s.live())
		await s.restore()
	}

	// --- Switching one profile off leaves the others
	{
		const s = await setup({ profiles: [prof('a'), prof('b'), prof('c')] })
		const before = s.sent('a').length
		const view = await s.settingsView()
		switchOf(view, 'B').props.onValueChange(false)
		await sleep(1100)
		check('switching a profile off removes only its presence', s.lastOf('b').activity === null && s.live().sort().join() === 'a,c', s.live())
		check('the others still have theirs', s.lastOf('a').activity.name === 'Game a' && s.lastOf('c').activity.name === 'Game c')
		check('the switch is saved', s.storage.cache.profiles.find(p => p.id === 'b').enabled === false)
		check('and the screen says it is off', switchOf(await s.settingsView(), 'B').props.subLabel === 'Off')
		switchOf(view, 'B').props.onValueChange(true)
		await sleep(1100)
		check('switching it on again shows it', s.live().sort().join() === 'a,b,c', s.live())
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a'), prof('b')] })
		const view = await s.settingsView()
		switchOf(view, 'Show presences').props.onValueChange(false)
		await sleep(900)
		check('the main switch removes every presence', s.live().length === 0 && s.lastOf('a').activity === null && s.lastOf('b').activity === null, s.live())
		switchOf(view, 'Show presences').props.onValueChange(true)
		await sleep(900)
		check('and turning it on shows them again', s.live().sort().join() === 'a,b')
		view.unmount()
		await s.restore()
	}

	// --- Each profile has its own timer
	{
		const s = await setup({ profiles: [prof('a', { timestampMode: 'elapsed' }), prof('b', { timestampMode: 'elapsed', enabled: false })] })
		const startA = s.lastOf('a').activity.timestamps.start
		await sleep(1200)
		const view = await s.settingsView()
		switchOf(view, 'B').props.onValueChange(true)
		await sleep(900)
		const startB = s.lastOf('b').activity.timestamps.start
		check('a profile switched on later counts from when it was switched on', startB >= startA + 1000, [startA, startB])
		check('and the first profile’s timer is not restarted when it is sent again', s.lastOf('a').activity.timestamps.start === startA, [s.lastOf('a').activity.timestamps.start, startA])
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { state: '{uptime}' }), prof('b', { state: '{uptime}', enabled: false })] })
		await sleep(2200)
		const view = await s.settingsView()
		switchOf(view, 'B').props.onValueChange(true)
		await sleep(900)
		const seconds = text => { const [m, sec] = text.split(':').map(Number); return m * 60 + sec }
		check('{uptime} counts from when that profile was applied', seconds(s.lastOf('b').activity.state) <= 1 && seconds(s.lastOf('a').activity.state) >= 2, [s.lastOf('a').activity.state, s.lastOf('b').activity.state])
		view.unmount()
		await s.restore()
	}
	{
		// A looping timer of 2 seconds on one profile, and an elapsed timer on another.
		const s = await setup({ profiles: [prof('loop', { timestampMode: 'custom', customStart: '1000', customEnd: '1002' }), prof('plain', { timestampMode: 'elapsed' })] })
		const plainSends = s.sent('plain').length
		const first = s.lastOf('loop').activity.timestamps
		check('a custom timer with a start and an end is the length between them', first.end - first.start === 2000, first)
		await sleep(3600)
		check('the looping timer restarts by itself', s.sent('loop').length >= 2, s.sent('loop').length)
		check('and the restart is sent for that profile alone', s.sent('plain').length === plainSends, [s.sent('plain').length, plainSends])
		check('with a later start each time', s.lastOf('loop').activity.timestamps.start > first.start)
		await s.restore()
	}

	// --- Adding, copying and deleting
	{
		const s = await setup({ profiles: [prof('a'), prof('b')] })
		const view = await s.settingsView()
		rowOf(view, 'New profile').props.onPress()
		await sleep(900)
		const added = s.storage.cache.profiles.at(-1)
		check('a new profile is added at the end and starts off', s.storage.cache.profiles.length === 3 && added.enabled === false)
		check('it is opened for editing', s.storage.cache.editing === added.id)
		check('and nothing new is sent for it', s.sent(added.id).length === 0 && s.live().sort().join() === 'a,b', s.live())
		rowOf(view, 'Duplicate profile').props.onPress()
		await sleep(900)
		check('a copy starts off as well, so copying never goes over the limit', s.storage.cache.profiles.at(-1).enabled === false)
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a'), prof('b')], settings: { editing: 'b' } })
		const view = await s.settingsView()
		rowOf(view, 'Delete profile').props.onPress()
		await sleep(900)
		check('deleting a profile removes its presence', s.lastOf('b').activity === null && s.live().join() === 'a', s.live())
		check('and the profile', s.storage.cache.profiles.map(p => p.id).join() === 'a' && s.storage.cache.editing === 'a')
		rowOf(view, 'Delete profile').props.onPress()
		check('the last profile cannot be deleted', s.storage.cache.profiles.length === 1)
		view.unmount()
		await s.restore()
	}

	// --- Editing one profile sends only that profile
	{
		const s = await setup({ profiles: [prof('a'), prof('b')], settings: { editing: 'b' } })
		const view = await s.settingsView()
		const aSends = s.sent('a').length
		inputOf(view, 'Activity name').props.onChange('Renamed')
		await view.settle()
		await sleep(1100)
		check('typing in a profile’s fields changes that profile’s presence', s.lastOf('b').activity.name === 'Renamed', s.lastOf('b'))
		check('and does not send the others again', s.sent('a').length === aSends, [s.sent('a').length, aSends])
		const radio = findNode(view.tree, n => n.type === 'Design.TableRadioGroup' && n.props.title === 'Edit profile')
		check('the edit list has every profile, with the one being edited chosen', radio.props.value === 'b' && findNodes(radio, n => n.type === 'Design.TableRadioRow').length === 2)
		const sendsBefore = s.activities().length
		radio.props.onChange('a')
		await sleep(400)
		check('choosing another profile to edit sends nothing', s.activities().length === sendsBefore && s.storage.cache.editing === 'a')
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a'), prof('b')] })
		const view = await s.settingsView()
		const bSends = s.sent('b').length
		rowOf(view, 'Apply this profile now').props.onPress()
		await sleep(150)
		check('"Apply this profile now" sends only that profile', s.sent('a').length === 2 && s.sent('b').length === bSends, [s.sent('a').length, s.sent('b').length])
		rowOf(view, 'Apply everything now').props.onPress()
		await sleep(150)
		check('"Apply everything now" sends all of them', s.sent('a').length === 3 && s.sent('b').length === bSends + 1)
		rowOf(view, 'Clear every presence').props.onPress()
		check('"Clear every presence" removes all of them', s.live().length === 0 && s.lastOf('a').activity === null && s.lastOf('b').activity === null)
		check('with a toast', s.toasts().includes('Presences cleared'), s.toasts())
		view.unmount()
		await s.restore()
	}

	// --- Standings
	{
		const s = await setup({ profiles: [prof('a'), prof('noname', { name: '' }), prof('gated', { showOnlyWhen: '{sc_title}' }), prof('off', { enabled: false })] })
		const view = await s.settingsView()
		check('a profile that is shown says so', switchOf(view, 'A').props.subLabel === 'Shown on your profile')
		check('one with no name says it needs one', switchOf(view, 'NONAME').props.subLabel.includes('needs an Activity name'))
		check('one hidden by "show only when" says so', switchOf(view, 'GATED').props.subLabel.includes('"show only when" is empty'), switchOf(view, 'GATED').props.subLabel)
		check('one that is off says off', switchOf(view, 'OFF').props.subLabel === 'Off')
		check('the heading counts only those shown', textOf(view.tree).includes('Showing now (1 of up to 3)'), textOf(view.tree).slice(0, 500))
		check('only the one that is shown has a presence: the hidden and nameless ones send only a removal', s.live().join() === 'a' && s.sent('gated').every(a => a.activity === null) && s.sent('noname').every(a => a.activity === null) && s.sent('off').length === 0, s.live())
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('gated', { showOnlyWhen: '{sc_title}' })], vars: { sc_title: 'Song' } })
		check('"show only when" shows the profile once its text has something in it', s.live().join() === 'gated', s.live())
		await s.restore()
		delete globalThis.eskimoVars
	}

	// --- The settings screen
	{
		const s = await setup({ profiles: [prof('a', { name: 'Screen', details: 'Hello' }), prof('b')] })
		const view = await s.settingsView()
		const text = textOf(view.tree)
		check('the preview shows the profile being edited', text.includes('Playing Screen') && text.includes('Hello'), text.slice(0, 300))
		check('the screen explains showing several at once', text.includes('Several at once') && text.includes('Showing now'))
		check('it has the limit field', !!inputOf(view, 'Most presences at once'))
		check('and the three actions', !!rowOf(view, 'Apply everything now') && !!rowOf(view, 'Apply this profile now') && !!rowOf(view, 'Clear every presence'))
		check('with the same fields as Rich Presence', ['Activity name', 'Details', 'State', 'Large image', 'Button 1 label', 'Party size'].every(l => !!inputOf(view, l)))
		view.unmount()
		await s.restore()
	}

	// --- Other plugins and reconnecting
	{
		const s = await setup({ profiles: [prof('a'), prof('b')], settings: { applyOnStart: false } })
		check('another plugin can reach the plugin’s own global, not Rich Presence’s', typeof globalThis.eskimoCustomRpcTest?.apply === 'function' && globalThis.eskimoRichPresence === undefined)
		globalThis.eskimoCustomRpcTest.apply()
		await sleep(900)
		check('asking for the presences to be sent again sends every profile that is shown', s.live().sort().join() === 'a,b', s.live())
		await s.restore()
		check('the global is gone after stopping', globalThis.eskimoCustomRpcTest === undefined)
	}
	{
		const s = await setup({ profiles: [prof('a'), prof('b')] })
		const before = s.activities().length
		s.runtime.fire('CONNECTION_OPEN', {})
		await sleep(150)
		check('when Discord reconnects every presence is sent again', s.activities().length === before + 2 && s.live().sort().join() === 'a,b', [before, s.activities().length])
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { details: '{seconds}' }), prof('b')], settings: { refreshSeconds: '15' } })
		check('with a refresh interval set a profile is still sent once at start', s.sent('a').length === 1 && s.sent('b').length === 1)
		await s.restore()
	}

	// --- Old saves
	{
		const old = { enabled: true, applyOnStart: true, refreshSeconds: '0', activeProfile: 'x', profiles: [{ id: 'x', label: 'Old', name: 'From before', type: 0 }] }
		const runtime = createRuntime({ stores: { UserStore: { getCurrentUser: () => ({ username: 'u' }) } } }).install()
		const { definition } = loadPlugin('custom-rpc-test')
		const storage = runtime.makeStorage(old)
		const running = await startPlugin(definition, runtime, { storage })
		await sleep(80)
		check('a save from Rich Presence (no on-switch, no limit) loads without breaking', running.errors.length === 0)
		const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api: { jsonStorage: storage } }))
		await view.settle()
		check('the profile is there and off until it is switched on', findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === 'Old').props.value === false)
		view.unmount()
		await running.stop()
	}

	globalThis.setTimeout = realSetTimeout
	done()
})()
