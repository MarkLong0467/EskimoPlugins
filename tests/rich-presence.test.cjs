'use strict'

/**
 * Tests for Rich Presence 2.0: several presences at once, every kind of timer, schedules, and the settings screens.
 * (The SoundCloud part has its own file, rich-presence-soundcloud.test.cjs.)
 * Run with: node tests/rich-presence.test.cjs (build first: bun run build:dev, or just run `bun run test`).
 */

const fs = require('node:fs')
const path = require('node:path')
const { createReporter, createRuntime, loadPlugin, findNode, findNodes, textOf, sleep, ROOT } = require('./lib/harness.cjs')

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

const { check, done } = createReporter('Rich Presence')

// The plugin waits 3 seconds after Discord reconnects and 0.4 seconds between profiles. The tests do not need to wait that long.
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...rest) => (ms === 3000 ? setImmediate(fn, ...rest) : ms === 400 ? realSetTimeout(fn, 5, ...rest) : realSetTimeout(fn, ms, ...rest))

// The clock can be moved forward to reach midnight, the end of a countdown or a schedule without waiting.
const realNow = Date.now.bind(Date)
let skew = 0
Date.now = () => realNow() + skew

const PREFIX = 'EskimoRichPresence:'
const MINUTE = 60000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A profile with the given fields over a blank one. It is switched on unless the fields say otherwise. */
const TYPE_OF = { a: 0, b: 2, c: 3, d: 5, e: 1 }
const prof = (id, fields = {}) => ({
	id,
	kind: 'custom',
	label: id.toUpperCase(),
	enabled: true,
	name: `Game ${id}`,
	type: TYPE_OF[id] ?? 0,
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
	countdownLoop: false,
	timerDate: '',
	timerRepeat: 'none',
	dailyFrom: '09:00',
	dailyTo: '17:00',
	partyCurrent: '',
	partyMax: '',
	button1Label: '',
	button1Url: '',
	button2Label: '',
	button2Url: '',
	showOnlyWhen: '',
	scheduleOn: false,
	scheduleDays: [true, true, true, true, true, true, true],
	scheduleFrom: '09:00',
	scheduleTo: '17:00',
	...fields,
})

/** A time of day, `minutes` minutes from now, written as HH:MM. */
const clockIn = minutes => {
	const d = new Date(Date.now() + minutes * MINUTE)
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** A fake Discord with the plugin running and the given profiles saved. */
async function setup({ profiles = [prof('a')], settings = {}, user = { username: 'chase', globalName: 'Chase' }, vars = null, timestamps = null, before = null } = {}) {
	const saved = { enabled: true, applyOnStart: true, refreshSeconds: '0', maxActive: '3', profiles, ...settings }
	const copied = []
	const runtime = createRuntime({
		stores: { UserStore: { getCurrentUser: () => user }, LocalActivityStore: { getActivities: () => [1, 2, 3] }, SelfPresenceStore: { getActivities: () => [1, 2], getUnfilteredActivities: () => [1, 2, 3] } },
		overrides: {
			externals: { ReactNativeClipboard: { Clipboard: { setString: text => copied.push(text), getString: async () => '' } } },
			discord: { native: { ClientInfoModule: { getConstants: () => ({ Version: '352.6', Build: '352206', ReleaseChannel: 'canary' }) } } },
		},
	}).install()
	if (before) before(runtime)
	delete globalThis.eskimoVars
	delete globalThis.eskimoTimestamps
	if (vars) globalThis.eskimoVars = vars
	if (timestamps) globalThis.eskimoTimestamps = timestamps
	const { definition } = loadPlugin('rich-presence')
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
	return { runtime, running, definition, storage, activities, sent, lastOf, live, toasts, settingsView, restore, copied }
}

const switchOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === label)
const rowOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
const inputOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TextInput' && n.props.label === label)
const groupOf = (view, title) => findNode(view.tree, n => n.type === 'Design.TableRadioGroup' && n.props.title === title)
/** A part of a screen: a titled group, or a block that starts with a big heading (the Stack whose first child is the heading). */
const sectionOf = (view, start) =>
	findNode(view.tree, n => n.type === 'Design.TableRowGroup' && String(n.props.title).startsWith(start)) ??
	findNodes(view.tree, n => n.type === 'Design.Stack').find(s => {
		const first = [s.children].flat(Infinity).filter(Boolean)[0]
		return first && typeof first === 'object' && first.type === 'View' && textOf(first).startsWith(start)
	}) ??
	null
const buttonOf = (view, text) => findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === text)

/** Opens a presence's editor from the list and picks a page. */
async function openEditor(view, label) {
	findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label && n.props.arrow).props.onPress()
	await view.settle()
}

/** Types into a text box the way a person does, and waits for it to be saved and sent. */
async function type(view, label, value, wait = 1000) {
	inputOf(view, label).props.onChange(value)
	await view.settle()
	await sleep(wait)
}

;(async () => {
	// --- One profile works as in Rich Presence 1
	{
		const s = await setup({ profiles: [prof('a', { name: 'My game', type: 2, details: 'Level {seconds}', state: 'for {user}', applicationId: ' 123 ' })] })
		const a = s.lastOf('a').activity
		check('a profile is sent as a game would report it, under its own socket', s.sent('a').length === 1 && s.lastOf('a').socketId === 'EskimoRichPresence:a')
		check('its process number is its own', s.lastOf('a').pid >= 1337)
		check('the name, type and application are sent', a.name === 'My game' && a.type === 2 && a.application_id === '123' && a.flags === 1, a)
		check('variables are filled in', /^Level \d\d$/.test(a.details) && a.state === 'for Chase', a)
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { name: '' })] })
		check('a profile with no name sends nothing and nothing shows', s.activities().length === 0 && s.live().length === 0, s.activities())
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
		check('each one has its own process number', new Set(s.activities().map(a => a.pid)).size === 3)
		check('each carries its own activity', s.lastOf('a').activity.name === 'Game a' && s.lastOf('b').activity.name === 'Game b' && s.lastOf('c').activity.type === 3)
		check('they are sent one after another, in the order of the list', s.activities().map(a => a.socketId.slice(PREFIX.length)).join() === 'a,b,c', s.activities().map(a => a.socketId))
		await s.restore()
		check('stopping the plugin removes every presence', s.live().length === 0, s.live())
		check('and sends a removal to each socket', ['a', 'b', 'c'].every(id => s.lastOf(id).activity === null))
	}

	// --- The limit is three at most
	{
		const s = await setup({ profiles: [prof('a'), prof('b'), prof('c'), prof('d')], settings: { maxActive: '2' } })
		check('only as many as the limit are shown, the first ones in the list', s.live().sort().join() === 'a,b', s.live())
		check('the ones over the limit are not sent at all', s.sent('c').length === 0 && s.sent('d').length === 0)
		const view = await s.settingsView()
		check('the screen says which are over the limit', switchOf(view, 'C').props.subLabel.includes('over the limit') && switchOf(view, 'A').props.subLabel === 'Shown on your profile', switchOf(view, 'C').props.subLabel)
		check('and keeps their switch on', switchOf(view, 'C').props.value === true)
		check('the heading counts them', sectionOf(view, 'Show on my profile (2 of up to 2 showing)') !== null, textOf(view.tree).slice(0, 300))
		const limit = groupOf(view, 'Most presences at once')
		check('the limit is a pick of 1, 2 or 3', findNodes(limit, n => n.type === 'Design.TableRadioRow').map(n => n.props.label).join() === '1,2,3' && limit.props.value === 2)
		limit.props.onChange(3)
		await view.settle()
		await sleep(900)
		check('raising the limit shows one more', s.live().sort().join() === 'a,b,c', s.live());
		check('and saves it', s.storage.cache.maxActive === '3')
		view.unmount()
		await s.restore()
	}
	for (const [typed, shown] of [['9', 3], ['5', 3], ['0', 1], ['abc', 3], ['', 3], ['1', 1]]) {
		const s = await setup({ profiles: [prof('a'), prof('b'), prof('c'), prof('d'), prof('e'), prof('f')].map((p, i) => ({ ...p, type: [2, 3, 5, 2, 3, 5][i] })), settings: { maxActive: typed } })
		check(`a limit saved as "${typed}" allows ${shown}`, s.live().length === shown, s.live())
		await s.restore()
	}

	// --- Switching one profile off leaves the others
	{
		const s = await setup({ profiles: [prof('a'), prof('b'), prof('c')] })
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

	// --- Every kind of timer
	{
		const s = await setup({ profiles: [prof('a', { timestampMode: 'none' }), prof('b', { timestampMode: 'elapsed' })] })
		const before = Date.now()
		check('"No timer" sends no timestamps', s.lastOf('a').activity.timestamps === undefined)
		check('"Since switched on" counts up from when it was applied', Math.abs(s.lastOf('b').activity.timestamps.start - before) < 3000 && s.lastOf('b').activity.timestamps.end === undefined, s.lastOf('b').activity.timestamps)
		await s.restore()
	}
	{
		const before = Date.now()
		const s = await setup({ profiles: [prof('a', { timestampMode: 'app' })] })
		const ts = s.lastOf('a').activity.timestamps
		check('"Since Discord opened" counts up from when the plugin started', ts.start >= before - 50 && ts.start <= Date.now() && ts.end === undefined, ts)
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { timestampMode: 'clock' })] })
		const midnight = new Date(Date.now())
		midnight.setHours(0, 0, 0, 0)
		check('"Time of day" counts up from midnight', s.lastOf('a').activity.timestamps.start === midnight.getTime(), s.lastOf('a').activity.timestamps)
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('past', { type: 2, timestampMode: 'since', timerDate: '2020-01-01 08:30' }), prof('future', { type: 3, timestampMode: 'since', timerDate: '2099-01-01 08:30' }), prof('none', { type: 5, timestampMode: 'since', timerDate: 'soon' })] })
		check('"Since a date" counts up from a date in the past', s.lastOf('past').activity.timestamps.start === new Date(2020, 0, 1, 8, 30).getTime() && s.lastOf('past').activity.timestamps.end === undefined, s.lastOf('past').activity.timestamps)
		check('a date still to come has no timer yet', s.lastOf('future').activity.timestamps === undefined)
		check('text that is not a date gives no timer', s.lastOf('none').activity.timestamps === undefined)
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { type: 2, timestampMode: 'until', timerDate: '2099-12-31 23:59' }), prof('b', { type: 3, timestampMode: 'until', timerDate: '2020-01-01 08:30' })] })
		check('"Until a date" counts down to it', s.lastOf('a').activity.timestamps.end === new Date(2099, 11, 31, 23, 59).getTime() && s.lastOf('a').activity.timestamps.start === undefined, s.lastOf('a').activity.timestamps)
		check('a date that has passed and does not repeat has no timer', s.lastOf('b').activity.timestamps === undefined)
		await s.restore()
	}
	{
		// A date in the past repeating: it counts down to the next time it comes round.
		const at = (offsetDays, h, m) => { const d = new Date(Date.now()); d.setDate(d.getDate() + offsetDays); d.setHours(h, m, 0, 0); return d }
		const stamp = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
		const twoDaysAgo = at(-2, 10, 15)
		const nextTen = at(0, 10, 15).getTime() > Date.now() ? at(0, 10, 15) : at(1, 10, 15)
		const s = await setup({ profiles: [prof('d', { type: 2, timestampMode: 'until', timerDate: stamp(twoDaysAgo), timerRepeat: 'daily' })] })
		check('a daily repeat counts down to the next time of that hour', s.lastOf('d').activity.timestamps.end === nextTen.getTime(), [s.lastOf('d').activity.timestamps, nextTen.getTime()])
		await s.restore()
		const lastWeek = at(-8, 10, 15)
		const nextWeekly = new Date(lastWeek.getTime())
		while (nextWeekly.getTime() <= Date.now()) nextWeekly.setDate(nextWeekly.getDate() + 7)
		const w = await setup({ profiles: [prof('w', { type: 2, timestampMode: 'until', timerDate: stamp(lastWeek), timerRepeat: 'weekly' })] })
		check('a weekly repeat keeps the day of the week', w.lastOf('w').activity.timestamps.end === nextWeekly.getTime(), [w.lastOf('w').activity.timestamps, nextWeekly.getTime()])
		await w.restore()
		const year = new Date(Date.now()).getFullYear()
		const birthday = new Date(year, 5, 15, 12, 0)
		const nextBirthday = birthday.getTime() > Date.now() ? birthday : new Date(year + 1, 5, 15, 12, 0)
		const y = await setup({ profiles: [prof('y', { type: 2, timestampMode: 'until', timerDate: '2001-06-15 12:00', timerRepeat: 'yearly' })] })
		check('a yearly repeat counts down to the next birthday', y.lastOf('y').activity.timestamps.end === nextBirthday.getTime(), [y.lastOf('y').activity.timestamps, nextBirthday.getTime()])
		await y.restore()
		const m = await setup({ profiles: [prof('m', { type: 2, timestampMode: 'until', timerDate: '2001-01-31 09:00', timerRepeat: 'monthly' })] })
		const monthEnd = new Date(m.lastOf('m').activity.timestamps.end)
		check('a monthly repeat lands on the same day of a coming month (the 31st becomes the last day of a short month)', monthEnd.getTime() > Date.now() && monthEnd.getHours() === 9 && monthEnd.getDate() === Math.min(31, new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 1, 0).getDate()), monthEnd.toString())
		await m.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { timestampMode: 'countdown', countdownMinutes: '30' })] })
		const ts = s.lastOf('a').activity.timestamps
		check('"Countdown" ends that many minutes from when it was applied', Math.abs(ts.end - (Date.now() + 30 * MINUTE)) < 3000 && ts.start === undefined, ts)
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { timestampMode: 'countdown', countdownMinutes: '1', countdownLoop: true })] })
		const first = s.lastOf('a').activity.timestamps
		check('a looping countdown starts like a countdown', Math.abs(first.end - (Date.now() + MINUTE)) < 3000, first)
		const sends = s.sent('a').length
		skew += 61 * 1000
		await sleep(1600)
		const again = s.lastOf('a').activity.timestamps
		check('when it runs out it starts over by itself', s.sent('a').length === sends + 1 && again.end > first.end && Math.abs(again.end - (Date.now() + MINUTE)) < 3000, [again, first])
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { timestampMode: 'countdown', countdownMinutes: '1', countdownLoop: false })] })
		skew += 61 * 1000
		await sleep(1600)
		check('a countdown that does not loop just ends, and the card loses its timer', s.lastOf('a').activity.timestamps === undefined, s.lastOf('a').activity)
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { timestampMode: 'midnight' })] })
		const next = new Date(Date.now())
		next.setHours(24, 0, 0, 0)
		check('"Until midnight" ends at the next midnight', s.lastOf('a').activity.timestamps.end === next.getTime() && s.lastOf('a').activity.timestamps.start === undefined, s.lastOf('a').activity.timestamps)
		const sends = s.sent('a').length
		skew += next.getTime() - Date.now() + 500
		await sleep(1600)
		check('and when midnight comes it moves on to the next one', s.sent('a').length === sends + 1 && s.lastOf('a').activity.timestamps.end === next.getTime() + DAY, [s.lastOf('a').activity.timestamps.end, next.getTime() + DAY])
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('in', { type: 2, timestampMode: 'daily', dailyFrom: clockIn(-60), dailyTo: clockIn(60) }), prof('out', { type: 3, timestampMode: 'daily', dailyFrom: clockIn(60), dailyTo: clockIn(120) })] })
		const ts = s.lastOf('in').activity.timestamps
		check('"Between two times each day" is a progress bar while the range is on', ts.end - ts.start === 2 * HOUR && ts.start <= Date.now() && ts.end > Date.now(), ts)
		check('and has no timer outside the range', s.lastOf('out').activity.timestamps === undefined)
		const sends = s.sent('out').length
		skew += 70 * MINUTE
		await sleep(1600)
		const out = s.lastOf('out').activity.timestamps
		check('when the range starts the timer appears by itself', s.sent('out').length === sends + 1 && out && out.end - out.start === HOUR, s.lastOf('out').activity)
		await s.restore()
	}
	{
		const from = clockIn(-30)
		const to = clockIn(-60)
		const s = await setup({ profiles: [prof('a', { timestampMode: 'daily', dailyFrom: from, dailyTo: to })] })
		const ts = s.lastOf('a').activity.timestamps
		check('a range that ends before it starts runs past midnight', ts.end - ts.start === 23.5 * HOUR && ts.start <= Date.now(), ts)
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { type: 2, timestampMode: 'custom', customStart: '2026-01-01 12:00' }), prof('b', { type: 3, timestampMode: 'custom', customEnd: '2099-01-01 12:00' })] })
		check('a custom timer with only a start counts up from it', s.lastOf('a').activity.timestamps.start === new Date(2026, 0, 1, 12, 0).getTime() && s.lastOf('a').activity.timestamps.end === undefined)
		check('with only an end it counts down to it', s.lastOf('b').activity.timestamps.end === new Date(2099, 0, 1, 12, 0).getTime() && s.lastOf('b').activity.timestamps.start === undefined)
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { timestampMode: 'external' })] })
		check('"From the SoundCloud track" has no timer while nothing plays', s.lastOf('a').activity.timestamps === undefined)
		await s.restore()
		const t = await setup({ profiles: [prof('a', { timestampMode: 'external' })], timestamps: { start: 1000, end: 2000 } })
		check('and uses the start and end of the SoundCloud track when there is one', JSON.stringify(t.lastOf('a').activity.timestamps) === '{"start":1000,"end":2000}', t.lastOf('a').activity.timestamps)
		await t.restore()
		delete globalThis.eskimoTimestamps
	}
	{
		// A looping custom timer of 2 seconds on one profile, and an elapsed timer on another.
		const s = await setup({ profiles: [prof('loop', { type: 2, timestampMode: 'custom', customStart: '1000', customEnd: '1002' }), prof('plain', { type: 3, timestampMode: 'elapsed' })] })
		const plainSends = s.sent('plain').length
		const first = s.lastOf('loop').activity.timestamps
		check('a custom timer with a start and an end is the length between them', first.end - first.start === 2000, first)
		await sleep(3600)
		check('the looping timer restarts by itself', s.sent('loop').length >= 2, s.sent('loop').length)
		check('and the restart is sent for that profile alone', s.sent('plain').length === plainSends, [s.sent('plain').length, plainSends])
		check('with a later start each time', s.lastOf('loop').activity.timestamps.start > first.start)
		await s.restore()
	}

	// --- Schedules
	{
		const today = new Date(Date.now()).getDay()
		const without = [0, 1, 2, 3, 4, 5, 6].map(d => d !== today)
		const only = [0, 1, 2, 3, 4, 5, 6].map(d => d === today)
		const s = await setup({
			profiles: [
				prof('off', { type: 2, scheduleOn: true, scheduleDays: without, scheduleFrom: '', scheduleTo: '' }),
				prof('on', { type: 3, scheduleOn: true, scheduleDays: only, scheduleFrom: '', scheduleTo: '' }),
				prof('free', { type: 5, scheduleOn: false, scheduleDays: without }),
			],
		})
		check('a profile whose schedule leaves out today is not shown', s.live().sort().join() === 'free,on', s.live())
		check('one whose schedule includes today is', s.lastOf('on').activity.name === 'Game on')
		check('with the schedule off the days do not matter', s.lastOf('free').activity.name === 'Game free')
		const view = await s.settingsView()
		check('the screen says it is waiting for its schedule', switchOf(view, 'OFF').props.subLabel.includes('waiting for its schedule'), switchOf(view, 'OFF').props.subLabel)
		check('and it does not use a place in the limit', sectionOf(view, 'Show on my profile (2 of up to 3 showing)') !== null)
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({
			profiles: [prof('later', { type: 2, scheduleOn: true, scheduleFrom: clockIn(60), scheduleTo: clockIn(180) }), prof('now', { type: 3, scheduleOn: true, scheduleFrom: clockIn(-60), scheduleTo: clockIn(60) })],
		})
		check('a profile is shown inside its time range and not outside it', s.live().join() === 'now', s.live())
		skew += 90 * MINUTE
		await sleep(1800)
		check('when its range starts it appears by itself', s.live().includes('later'), s.live())
		check('and when the other range ends it goes by itself', s.lastOf('now').activity === null && s.live().join() === 'later', s.live())
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { scheduleOn: true, scheduleFrom: clockIn(-30), scheduleTo: clockIn(-60) })] })
		check('a range that ends before it starts runs past midnight', s.live().join() === 'a', s.live())
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { scheduleOn: true, scheduleDays: [false, false, false, false, false, false, false], scheduleFrom: '', scheduleTo: '' })] })
		check('a schedule with no days shows nothing', s.live().length === 0)
		await s.restore()
	}

	// --- The watcher puts things right
	{
		const s = await setup({ profiles: [prof('a'), prof('b', { type: 2 }), prof('c', { type: 3 }), prof('d', { type: 5, enabled: false })], settings: { maxActive: '2' } })
		check('with room for two only the first two show', s.live().sort().join() === 'a,b', s.live())
		const view = await s.settingsView()
		switchOf(view, 'A').props.onValueChange(false)
		await sleep(1800)
		check('when one goes away the next in line takes its place', s.live().sort().join() === 'b,c', s.live())
		view.unmount()
		await s.restore()
	}

	// --- Adding, copying and deleting
	{
		const s = await setup({ profiles: [prof('a'), prof('b')] })
		const view = await s.settingsView()
		rowOf(view, 'Add a presence').props.onPress()
		await sleep(900)
		await view.settle()
		const added = s.storage.cache.profiles.at(-1)
		check('a new profile is added at the end and starts off', s.storage.cache.profiles.length === 3 && added.enabled === false && added.kind === 'custom')
		check('it is opened for editing', !!inputOf(view, 'Activity name') && !!sectionOf(view, 'Basics'))
		check('and nothing new is sent for it', s.sent(added.id).length === 0 && s.live().sort().join() === 'a,b', s.live())
		rowOf(view, 'Duplicate').props.onPress()
		await sleep(900)
		check('a copy starts off as well, so copying never goes over the limit', s.storage.cache.profiles.at(-1).enabled === false && s.storage.cache.profiles.length === 4)
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a'), prof('b')] })
		const view = await s.settingsView()
		await openEditor(view, 'B')
		rowOf(view, 'Delete').props.onPress()
		await sleep(900)
		await view.settle()
		check('deleting a profile removes its presence', s.lastOf('b').activity === null && s.live().join() === 'a', s.live())
		check('and the profile, and goes back to the list', s.storage.cache.profiles.map(p => p.id).join() === 'a' && !!sectionOf(view, 'Show on my profile'))
		await openEditor(view, 'A')
		rowOf(view, 'Delete').props.onPress()
		await sleep(300)
		check('the last profile cannot be deleted', s.storage.cache.profiles.length === 1 && s.toasts().includes('Keep at least one presence'), s.toasts())
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { name: 'Copy me', details: 'Hello', timestampMode: 'until', timerDate: '2099-01-01 10:00' })] })
		const view = await s.settingsView()
		await openEditor(view, 'A')
		rowOf(view, 'Copy as text').props.onPress()
		const json = JSON.parse(s.copied.at(-1))
		check('a presence is copied as text with its timer settings', json.name === 'Copy me' && json.timestampMode === 'until' && json.timerDate === '2099-01-01 10:00' && json.id === undefined && json.enabled === undefined, json)
		view.unmount()
		await s.restore()
	}

	// --- Editing one profile sends only that profile
	{
		const s = await setup({ profiles: [prof('a'), prof('b')] })
		const view = await s.settingsView()
		const aSends = s.sent('a').length
		await openEditor(view, 'B')
		await type(view, 'Activity name', 'Renamed', 1100)
		check('typing in a profile’s fields changes that profile’s presence', s.lastOf('b').activity.name === 'Renamed', s.lastOf('b'))
		check('and does not send the others again', s.sent('a').length === aSends, [s.sent('a').length, aSends])
		check('the preview follows the typing', textOf(view.tree).includes('Listening to Renamed'))
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a'), prof('b')] })
		const view = await s.settingsView()
		const bSends = s.sent('b').length
		rowOf(view, 'Apply everything now').props.onPress()
		await sleep(150)
		check('"Apply everything now" sends all of them', s.sent('a').length === 2 && s.sent('b').length === bSends + 1, [s.sent('a').length, s.sent('b').length])
		await openEditor(view, 'A')
		rowOf(view, 'Show this now').props.onPress()
		await sleep(150)
		check('"Show this now" sends only that profile', s.sent('a').length === 3 && s.sent('b').length === bSends + 1, [s.sent('a').length, s.sent('b').length])
		buttonOf(view, '‹ All presences').props.onPress()
		await view.settle()
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
		check('the heading counts only those shown', sectionOf(view, 'Show on my profile (1 of up to 3 showing)') !== null)
		check('only the one that is shown has a presence', s.live().join() === 'a' && s.sent('gated').length === 0 && s.sent('noname').length === 0 && s.sent('off').length === 0, s.live())
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('gated', { showOnlyWhen: '{sc_title}' })], vars: { sc_title: 'Song' } })
		check('"show only when" shows the profile once its text has something in it', s.live().join() === 'gated', s.live())
		await s.restore()
		delete globalThis.eskimoVars
	}

	// --- The list screen
	{
		const s = await setup({ profiles: [prof('a', { name: 'Screen', details: 'Hello', timestampMode: 'countdown' }), prof('b', { timestampMode: 'none' })] })
		const view = await s.settingsView()
		const text = textOf(view.tree)
		check('the preview lists what is on the profile', text.includes('Playing Screen') && text.includes('Listening to Game b'), text.slice(0, 300))
		const toggles = sectionOf(view, 'Show on my profile')
		check('each presence has a switch to show it', findNodes(toggles, n => n.type === 'Design.TableSwitchRow').length === 2)
		check('under the switches a note says several presences need different application ids', /different Application ID/i.test(rowOf(view, 'Using more than one?').props.subLabel) && /Leave the ID empty|made up/i.test(rowOf(view, 'Using more than one?').props.subLabel), rowOf(view, 'Using more than one?')?.props.subLabel)
		const rows = findNodes(sectionOf(view, 'Change a presence'), n => n.type === 'Design.TableRow')
		check('there is a row for each one that opens it', rows.length === 2 && rows[0].props.arrow === true)
		check('a row says what the presence is', rows[0].props.subLabel === 'Playing · Countdown' && rows[1].props.subLabel === 'Listening to', rows.map(r => r.props.subLabel))
		check('it offers adding a presence or SoundCloud, and pasting', !!rowOf(view, 'Add a presence') && !!rowOf(view, 'Add SoundCloud') && !!rowOf(view, 'Paste a copied presence'))
		check('the custom fields are not on the list', !inputOf(view, 'Activity name'))
		check('it ends with the debugging section', text.includes('DEBUGGING') && !!buttonOf(view, 'Copy logs'))
		view.unmount()
		await s.restore()
	}

	// --- The editor
	{
		const s = await setup({ profiles: [prof('a', { name: 'Edit me' })] })
		const view = await s.settingsView()
		await openEditor(view, 'A')
		const headings = ['Basics', 'Text', 'Group size', 'Images', 'Timer', 'Buttons', 'Schedule', 'Application ID', 'Variables', 'Manage']
		check('the editor is one page with a big heading for each part, and a button to go back', headings.every(h => !!sectionOf(view, h)) && !!buttonOf(view, '‹ All presences'), headings.filter(h => !sectionOf(view, h)))
		check('there are no page buttons', ['Basics', 'Text', 'Images', 'Timer', 'Buttons', 'When'].every(t => buttonOf(view, t) === null))
		check('Basics has the names, the kind and the Application ID with its explanation', !!inputOf(view, 'Activity name') && !!inputOf(view, 'Name in the list') && !!inputOf(view, 'Application ID') && !!groupOf(view, 'Kind of activity') && /different one/i.test(textOf(view.tree)))
		check('the preview shows it', textOf(view.tree).includes('Playing Edit me'))
		check('the lines, their links and the group size are all on the page', ['Top line', 'Bottom line', 'Top line link', 'Bottom line link', 'In the group now', 'Group size'].every(l => !!inputOf(view, l)))
		check('the large and small image fields are on the page', ['Large image', 'Large image text', 'Large image link', 'Small image', 'Small image text', 'Small image link'].every(l => !!inputOf(view, l)))
		check('the two buttons are on the page', ['Button 1 label', 'Button 1 link', 'Button 2 label', 'Button 2 link'].every(l => !!inputOf(view, l)))
		check('the parts come in order, like Kizzy', headings.every((h, i) => i === 0 || textOf(view.tree).indexOf(h) >= 0))
		check('the schedule switch and "show only when" are on the page', !!switchOf(view, 'Use a schedule') && !!inputOf(view, 'Show only when this has text'))
		check('the days appear only once a schedule is on', buttonOf(view, 'Mon') === null)
		switchOf(view, 'Use a schedule').props.onValueChange(true)
		await sleep(400)
		await view.settle()
		check('with a schedule on, there are seven days and a from and a to', ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].every(d => !!buttonOf(view, d)) && !!inputOf(view, 'From') && !!inputOf(view, 'To'))
		const mon = buttonOf(view, 'Mon').props.variant
		buttonOf(view, 'Mon').props.onPress()
		await sleep(400)
		await view.settle()
		check('tapping a day turns it off and on', mon === 'primary' && buttonOf(view, 'Mon').props.variant === 'secondary' && s.storage.cache.profiles[0].scheduleDays[1] === false)
		await type(view, 'From', '8pm', 600)
		check('a time field says how it read what was typed', /Reads as 8:00 PM/.test(inputOf(view, 'From').props.description), inputOf(view, 'From').props.description)
		await type(view, 'From', 'banana', 600)
		check('and says when it did not understand', /Not a time/.test(inputOf(view, 'From').props.description))
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { type: 1 })] })
		const view = await s.settingsView()
		await openEditor(view, 'A')
		check('a Streaming presence asks for the stream link', !!inputOf(view, 'Stream link'))
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a')] })
		const view = await s.settingsView()
		await openEditor(view, 'A')
		const modes = groupOf(view, 'What the timer does')
		const labels = findNodes(modes, n => n.type === 'Design.TableRadioRow').map(n => n.props.label)
		check('the timer page lists every kind of timer', labels.join() === 'No timer,Since switched on,Since Discord opened,Since a date,Until a date,Countdown,Until midnight,Time of day,Between two times each day,Start and end,From the SoundCloud track', labels)
		check('each says what it does', findNodes(modes, n => n.type === 'Design.TableRadioRow').every(n => typeof n.props.subLabel === 'string' && n.props.subLabel.length > 10))
		check('a timer with no settings shows no extra fields', !inputOf(view, 'Count up from') && !inputOf(view, 'Count down to') && !inputOf(view, 'Minutes'))
		modes.props.onChange('until')
		await sleep(400)
		await view.settle()
		check('"Until a date" shows the date field and how it repeats', !!inputOf(view, 'Count down to') && !!groupOf(view, 'When the date has passed'))
		check('the repeats are never, daily, weekly, monthly and yearly', findNodes(groupOf(view, 'When the date has passed'), n => n.type === 'Design.TableRadioRow').map(n => n.props.label).join() === 'Never,Every day,Every week,Every month,Every year')
		await type(view, 'Count down to', '2099-12-25 18:30', 600)
		check('the date field says how it read the date', /Reads as .*Dec 25 2099, 6:30 PM/.test(inputOf(view, 'Count down to').props.description), inputOf(view, 'Count down to').props.description)
		await type(view, 'Count down to', '2099-02-31', 600)
		check('a date that does not exist is not accepted', /Not a date/.test(inputOf(view, 'Count down to').props.description), inputOf(view, 'Count down to').props.description)
		await type(view, 'Count down to', '2099-12-25 18:30', 600)
		check('the date is saved and sent', s.storage.cache.profiles[0].timerDate === '2099-12-25 18:30' && s.lastOf('a').activity.timestamps.end === new Date(2099, 11, 25, 18, 30).getTime(), s.lastOf('a').activity.timestamps)
		check('and the preview says how long is left', /left/.test(textOf(view.tree)))
		groupOf(view, 'When the date has passed').props.onChange('yearly')
		await sleep(400)
		check('the repeat is saved', s.storage.cache.profiles[0].timerRepeat === 'yearly')
		groupOf(view, 'What the timer does').props.onChange('countdown')
		await sleep(400)
		await view.settle()
		check('"Countdown" shows the minutes and a switch to start over', !!inputOf(view, 'Minutes') && !!switchOf(view, 'Start over when it ends'))
		switchOf(view, 'Start over when it ends').props.onValueChange(true)
		await sleep(400)
		check('the loop switch is saved', s.storage.cache.profiles[0].countdownLoop === true)
		groupOf(view, 'What the timer does').props.onChange('daily')
		await sleep(400)
		await view.settle()
		check('"Between two times each day" shows From and To', !!inputOf(view, 'Every day from') && !!inputOf(view, 'Every day to'))
		groupOf(view, 'What the timer does').props.onChange('custom')
		await sleep(400)
		await view.settle()
		check('"Start and end" shows Start and End', !!inputOf(view, 'Start') && !!inputOf(view, 'End'))
		groupOf(view, 'What the timer does').props.onChange('since')
		await sleep(400)
		await view.settle()
		check('"Since a date" shows the date field but no repeat', !!inputOf(view, 'Count up from') && groupOf(view, 'When the date has passed') === null)
		view.unmount()
		await s.restore()
	}

	// --- Discord keeps only one "Playing" at a time, so only the first one is sent
	{
		const s = await setup({ profiles: [prof('p1', { type: 0 }), prof('p2', { type: 0 }), prof('l', { type: 2 }), prof('s', { type: 1 })] })
		check('of two Playing profiles only the first is sent', s.sent('p1').length > 0 && s.sent('p2').length === 0, s.live())
		check('the other kinds are sent next to it, up to the limit', s.live().sort().join() === 'l,p1,s', s.live())
		const view = await s.settingsView()
		check('the second Playing says why it is not shown', switchOf(view, 'P2').props.subLabel.includes('only one Playing'), switchOf(view, 'P2').props.subLabel)
		check('and keeps its switch on', switchOf(view, 'P2').props.value === true)
		check('it does not use up a place in the limit', sectionOf(view, 'Show on my profile (3 of up to 3 showing)') !== null)
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('p1', { type: 0 }), prof('p2', { type: 2 })] })
		const view = await s.settingsView()
		await openEditor(view, 'P2')
		const group = groupOf(view, 'Kind of activity')
		check('the kind list has the kinds', !!group && group.props.value === 2)
		group.props.onChange(0)
		await sleep(900)
		check('changing a profile to Playing when another already is leaves it out', s.lastOf('p2')?.activity === null && s.live().join() === 'p1', s.live())
		group.props.onChange(3)
		await sleep(900)
		check('changing it to Watching shows it next to the Playing one', s.live().sort().join() === 'p1,p2' && s.lastOf('p2').activity.type === 3, s.live())
		view.unmount()
		await s.restore()
	}

	// --- Each profile has its own application id
	{
		const s = await setup({ profiles: [prof('a'), prof('b'), prof('c')] })
		const ids = ['a', 'b', 'c'].map(id => s.lastOf(id).activity.application_id)
		check('profiles with no application id are each sent with one of their own', new Set(ids).size === 3 && ids.every(id => /^\d{18}$/.test(id)), ids)
		check('and not 0, which would make them all the same application', ids.every(id => id !== '0'))
		await s.restore()
		const again = await setup({ profiles: [prof('a'), prof('b'), prof('c')] })
		check('the same profile gets the same id every time', again.lastOf('a').activity.application_id === ids[0] && again.lastOf('c').activity.application_id === ids[2])
		await again.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { applicationId: ' 123456 ' }), prof('b')] })
		check('an application id that is typed in is used as it is', s.lastOf('a').activity.application_id === '123456')
		check('and the other profile keeps its own made-up one', /^\d{18}$/.test(s.lastOf('b').activity.application_id))
		await s.restore()
	}
	{
		// The same kind, application and name are one activity for Discord.
		const s = await setup({ profiles: [prof('a', { type: 2, name: 'Same', applicationId: '42' }), prof('b', { type: 2, name: 'Same', applicationId: '42' }), prof('c', { type: 2, name: 'Same', applicationId: '43' })] })
		check('a profile with the same kind, application and name as an earlier one is left out', s.live().sort().join() === 'a,c', s.live())
		const view = await s.settingsView()
		check('and says why', switchOf(view, 'B').props.subLabel.includes('same type, application and name'), switchOf(view, 'B').props.subLabel)
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { type: 2, name: 'Same' }), prof('b', { type: 2, name: 'Same' })] })
		check('two profiles with no application id are not the same, whatever they are called', s.live().sort().join() === 'a,b', s.live())
		await s.restore()
	}

	// --- A new profile starts with a kind that can show next to the others
	{
		const s = await setup({ profiles: [prof('a', { type: 0 })] })
		const view = await s.settingsView()
		rowOf(view, 'Add a presence').props.onPress()
		await sleep(700)
		await view.settle()
		check('a new profile starts as Listening to when Playing is taken', s.storage.cache.profiles.at(-1).type === 2, s.storage.cache.profiles.at(-1).type)
		buttonOf(view, '‹ All presences').props.onPress()
		await view.settle()
		rowOf(view, 'Add a presence').props.onPress()
		await sleep(700)
		check('the next one starts as Watching', s.storage.cache.profiles.at(-1).type === 3)
		view.unmount()
		await s.restore()
	}

	// --- Pasting a copied presence
	{
		const s = await setup({ profiles: [prof('a')] })
		s.runtime.valenced.externals.ReactNativeClipboard.Clipboard.getString = async () => JSON.stringify({ label: 'From a friend', name: 'Their game', type: 3, timestampMode: 'since', timerDate: '2020-05-05 10:00', kind: 'soundcloud', enabled: true, id: 'evil', scheduleDays: [false, true, true, true, true, true, false], scheduleOn: true })
		const view = await s.settingsView()
		rowOf(view, 'Paste a copied presence').props.onPress()
		await sleep(700)
		const added = s.storage.cache.profiles.at(-1)
		check('a pasted presence is added, switched off', added.label === 'From a friend' && added.name === 'Their game' && added.timestampMode === 'since' && added.enabled === false, added)
		check('it cannot pose as SoundCloud or take another id', added.kind === 'custom' && added.id !== 'evil')
		check('its schedule days come across', added.scheduleOn === true && added.scheduleDays.join() === 'false,true,true,true,true,true,false')
		s.runtime.valenced.externals.ReactNativeClipboard.Clipboard.getString = async () => 'not json'
		rowOf(view, 'Paste a copied presence').props.onPress()
		await sleep(300)
		check('something that is not a presence is refused', s.toasts().includes('Clipboard has no copied presence') && s.storage.cache.profiles.length === 2, s.toasts())
		view.unmount()
		await s.restore()
	}

	// --- Warnings the person can see
	{
		const s = await setup({ profiles: [prof('a', { type: 2, applicationId: '111111111111111111' }), prof('b', { type: 3, applicationId: '111111111111111111', button1Label: 'Go' }), prof('c', { type: 5, applicationId: 'abc', timestampMode: 'until', timerDate: 'soon', partyCurrent: '2' })] })
		const view = await s.settingsView()
		const fix = sectionOf(view, 'Fix this')
		const texts = findNodes(fix, n => n.type === 'Design.TableRow').map(n => n.props.subLabel).join(' | ')
		check('the list shows a "Fix this" group when something is wrong', !!fix && /Fix this \(\d+\)/.test(fix.props.title), texts)
		check('it says two presences share an Application ID', /same Application ID as "A"/.test(texts), texts)
		check('it says a button has no link, an ID is not a number, a date is missing and a group size is half filled', /Button 1 has a label but no link/.test(texts) && /should be a long number/.test(texts) && /needs a date and time/.test(texts) && /group size needs both/.test(texts), texts)
		await openEditor(view, 'B')
		check('the editor of that presence shows its own problems on every page', textOf(view.tree).includes('same Application ID') && !textOf(view.tree).includes('should be a long number'))
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { type: 2 }), prof('b', { type: 3 })] })
		const view = await s.settingsView()
		check('nothing is shown when everything is fine', sectionOf(view, 'Fix this') === null)
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('p1', { type: 0 }), prof('p2', { type: 0 })] })
		const view = await s.settingsView()
		check('a second Playing is explained', /only one Playing/.test(textOf(sectionOf(view, 'Fix this'))))
		view.unmount()
		await s.restore()
	}

	// --- The report
	{
		const s = await setup({
			profiles: [prof('a', { type: 0, name: 'Secret game', details: 'Secret details', applicationId: '99' }), prof('b', { type: 0 }), prof('c', { type: 2, timestampMode: 'countdown' })],
		})
		const view = await s.settingsView()
		findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Copy logs').props.onPress()
		await sleep(10)
		const report = s.copied.at(-1) || ''
		check('Copy logs puts a report on the clipboard', report.length > 200)
		check('the report names the plugin and credits only the author', report.includes('marklong.rich-presence') && report.includes('Made by MarkLong0467') && !report.includes('kmmiio99o') && !report.includes('PalmDevs'), report.split('\n').slice(0, 4))
		check('it counts the profiles, the ones shown and the ones sent', /Profiles: 3, switched on: 3, shown: 2 \(limit 3\), sent now: 2/.test(report), report.split('\n').slice(6, 18))
		check('it shows what Discord’s own lists hold, to see where activities are lost', /local store 3, kept by its filter 2, before its filter 3/.test(report), report)
		check('and says for each profile its kind, timer and why it is or is not shown', /Profile 1: type 0, timer none, application set, shown, sent/.test(report) && /Profile 2: type 0, timer none, application made up, second playing, not sent/.test(report) && /Profile 3: type 2, timer countdown, application made up, shown, sent/.test(report), report.split('\n').slice(6, 18))
		check('the report holds every setting and what was last sent', report.includes('Secret game') && report.includes('Secret details') && /Application ids sent: A=99, C=\d{18}/.test(report) && /Runtime a: socket EskimoRichPresence:a, pid \d+, live true/.test(report) && report.includes('last sent') && /LocalActivityStore.getActivities:/.test(report), report)
		check('it warns when two shown presences share an Application ID', /Every profile that is shown has its own Application ID/.test(report) && !/FAIL Every profile that is shown has its own/.test(report))
		view.unmount()
		await s.restore()
	}

	// --- Other plugins and reconnecting
	{
		const s = await setup({ profiles: [prof('a'), prof('b')], settings: { applyOnStart: false } })
		check('another plugin can reach the plugin’s global', typeof globalThis.eskimoRichPresence?.apply === 'function')
		globalThis.eskimoRichPresence.apply()
		await sleep(900)
		check('asking for the presences to be sent again sends every profile that is shown', s.live().sort().join() === 'a,b', s.live())
		await s.restore()
		check('the global is gone after stopping', globalThis.eskimoRichPresence === undefined)
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
		const old = { enabled: true, applyOnStart: true, refreshSeconds: '0', activeProfile: 'x', profiles: [{ id: 'x', label: 'Old', name: 'From before', type: 0 }, { id: 'y', label: 'Other', name: 'Not chosen', type: 2 }] }
		const runtime = createRuntime({ stores: { UserStore: { getCurrentUser: () => ({ username: 'u' }) } } }).install()
		const { definition } = loadPlugin('rich-presence')
		const storage = runtime.makeStorage(old)
		const running = await startPlugin(definition, runtime, { storage })
		await sleep(150)
		check('a save from Rich Presence 1 (one profile in use, no switches) loads without breaking', running.errors.length === 0)
		const live = runtime.log.dispatched.filter(a => a.type === 'LOCAL_ACTIVITY_UPDATE' && a.activity)
		check('the profile that was in use is on and the other is off', live.length === 1 && live[0].activity.name === 'From before', live.map(a => a.activity.name))
		const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api: { jsonStorage: storage } }))
		await view.settle()
		check('the list shows both, with the right switches', findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === 'Old').props.value === true && findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === 'Other').props.value === false)
		view.unmount()
		await running.stop()
	}

	// --- The group size takes big numbers, like Kizzy (999999999 of 999999999)
	{
		const partyOf = async fields => {
			const s = await setup({ profiles: [prof('a', { name: 'Game', state: 'In a match', ...fields })] })
			const party = s.lastOf('a')?.activity?.party
			await s.restore()
			return party
		}
		const party = async (cur, max) => JSON.stringify((await partyOf({ partyCurrent: cur, partyMax: max }))?.size ?? null)
		check('999999999 of 999999999 is sent as it is', (await party('999999999', '999999999')) === '[999999999,999999999]')
		check('the biggest size Discord takes (2147483647) is sent', (await party('2147483647', '2147483647')) === '[2147483647,2147483647]')
		check('one more than that is left out', (await party('1', '2147483648')) === 'null')
		check('a small group still works', (await party('1', '4')) === '[1,4]')
		check('a number in the group bigger than the size is cut to the size', (await party('9', '4')) === '[4,4]')
		check('0 in the group is left out, like Kizzy', (await party('0', '4')) === 'null')
		check('a size of 0 is left out', (await party('1', '0')) === 'null')
		check('letters or decimals are left out, not half read', (await party('4x', '9')) === 'null' && (await party('1.5', '9')) === 'null' && (await party('-1', '9')) === 'null')
		check('only one of the two numbers is left out', (await party('3', '')) === 'null' && (await party('', '3')) === 'null')
		check('spaces around the numbers are fine', (await party(' 2 ', ' 5 ')) === '[2,5]')

		const s = await setup({ profiles: [prof('a', { name: 'Edit me', state: 'In a match' })] })
		const view = await s.settingsView()
		await openEditor(view, 'A')
		check('the boxes take ten digits', inputOf(view, 'In the group now').props.maxLength === 10 && inputOf(view, 'Group size').props.maxLength === 10)
		await type(view, 'In the group now', '999999999', 600)
		await type(view, 'Group size', '999999999', 600)
		check('the preview says 999999999 of 999999999', textOf(view.tree).includes('In a match (999999999 of 999999999)'), textOf(view.tree).slice(0, 200))
		check('the saved presence is sent with it', JSON.stringify(s.lastOf('a').activity.party.size) === '[999999999,999999999]')
		await type(view, 'In the group now', 'abc', 600)
		check('letters get a note, like Kizzy', /Not a number/.test(inputOf(view, 'In the group now').props.description), inputOf(view, 'In the group now').props.description)
		await type(view, 'In the group now', '0', 600)
		check('0 gets a note', /more than 0/.test(inputOf(view, 'In the group now').props.description))
		await type(view, 'In the group now', '999999999999', 600)
		check('too big gets a note with the most', /2147483647/.test(inputOf(view, 'In the group now').props.description))
		await type(view, 'Group size', '3', 600)
		await type(view, 'In the group now', '5', 600)
		check('a number in the group over the size is explained on both boxes', /more than the group size/.test(inputOf(view, 'In the group now').props.description) && /less than the number in the group/.test(inputOf(view, 'Group size').props.description))
		await type(view, 'In the group now', '2', 600)
		check('and the notes go away when it is right', !/Cannot/.test(inputOf(view, 'In the group now').props.description) && !/Cannot/.test(inputOf(view, 'Group size').props.description))
		await type(view, 'Group size', '', 600)
		check('a size left empty while the group is filled in is pointed out', /cannot be empty/.test(inputOf(view, 'Group size').props.description))
		view.unmount()
		await s.restore()
	}
	{
		const s = await setup({ profiles: [prof('a', { name: 'Game', partyCurrent: '4x', partyMax: '9' })] })
		const view = await s.settingsView()
		check('a group size that cannot be read shows under Fix this', /group size is left out/i.test(textOf(sectionOf(view, 'Fix this') ?? { children: [] })), textOf(view.tree).slice(0, 300))
		view.unmount()
		await s.restore()
	}

	// --- A linked image is used instead of the application's own picture
	{
		const OWN = '1535583597195427920'
		const LINK = 'https://avatar.example.org/api/pfp/1368350549203746847/image.png'
		const HOSTED = 'mp:external/abc123/https/avatar.example.org/api/pfp/1368350549203746847/image.png'
		/** Discord's own asset functions. `loaded` says whether the application's art assets are loaded: then `getAssetIds` answers [null] for a link it has not seen. */
		const assetUtils = ({ loaded, failFor = [] }) => {
			const asked = []
			return {
				asked,
				exports: {
					getAssetIds: (app, keys) => (loaded ? keys.map(() => null) : []),
					fetchAssetIds: async (app, keys) => {
						asked.push(app)
						if (failFor.includes(app)) throw new Error('Missing Access')
						return keys.map(key => (/^https?:/.test(key) ? HOSTED : `asset-of-${key}`))
					},
				},
			}
		}
		const sentImage = s => s.lastOf('a')?.activity?.assets?.large_image

		for (const loaded of [true, false]) {
			const utils = assetUtils({ loaded })
			const s = await setup({
				profiles: [prof('a', { applicationId: OWN, largeImage: LINK })],
				before: runtime => runtime.valenced.modules.finders.loadModule(utils.exports),
			})
			check(`a linked image is sent as the hosted link (application assets ${loaded ? 'loaded' : 'not loaded'})`, sentImage(s) === HOSTED, s.lastOf('a')?.activity)
			check(`and it was hosted under the profile's own application, not the fallback one (assets ${loaded ? 'loaded' : 'not loaded'})`, utils.asked[0] === OWN && utils.asked.length === 1, utils.asked)
			check('the activity is sent for that same application', s.lastOf('a').activity.application_id === OWN)
			await s.restore()
		}

		// The application's own picture is only used when no image is given.
		{
			const utils = assetUtils({ loaded: true })
			const s = await setup({
				profiles: [prof('a', { applicationId: OWN, largeImage: '' })],
				before: runtime => runtime.valenced.modules.finders.loadModule(utils.exports),
			})
			check('with no image given no image is sent (the application\'s own picture shows)', sentImage(s) === undefined && utils.asked.length === 0, s.lastOf('a')?.activity)
			await s.restore()
		}

		// Another profile uses an asset key of the same application, which is what loads the application's assets.
		{
			const utils = assetUtils({ loaded: true })
			const s = await setup({
				profiles: [prof('a', { applicationId: OWN, largeImage: LINK }), prof('b', { applicationId: OWN, largeImage: 'gta-vi' })],
				settings: { maxActive: '3' },
				before: runtime => runtime.valenced.modules.finders.loadModule(utils.exports),
			})
			check('a profile with a link and one with an asset key of the same application both get their own image', s.lastOf('a').activity.assets.large_image === HOSTED && s.lastOf('b').activity.assets.large_image === 'asset-of-gta-vi', [s.lastOf('a').activity.assets, s.lastOf('b').activity.assets])
			await s.restore()
		}

		// The application cannot host it (not the user's): the fallback application does, and the image is still used.
		{
			const utils = assetUtils({ loaded: true, failFor: [OWN] })
			const s = await setup({
				profiles: [prof('a', { applicationId: OWN, largeImage: LINK })],
				before: runtime => runtime.valenced.modules.finders.loadModule(utils.exports),
			})
			check('when the profile\'s application cannot host it the fallback application is tried and the image is still sent', sentImage(s) === HOSTED && utils.asked.length === 2 && utils.asked[0] === OWN, [utils.asked, sentImage(s)])
			await s.restore()
		}

		// Without Discord's asset functions: the web API, under the profile's application first, then application 0.
		{
			const calls = []
			const http = {
				HTTPResponseError: class {},
				get() {},
				post: async ({ url }) => {
					calls.push(url)
					if (url.includes(OWN)) throw Object.assign(new Error('Forbidden'), { status: 403, body: { message: 'Missing Access' } })
					return { body: [{ external_asset_path: 'external/zzz/https/avatar.example.org/a.png' }] }
				},
			}
			const s = await setup({
				profiles: [prof('a', { applicationId: OWN, largeImage: LINK })],
				before: runtime => runtime.valenced.modules.finders.loadModule(http),
			})
			check('through the web API the image is asked for under the profile\'s application first, then application 0', calls[0] === `/applications/${OWN}/external-assets` && calls[1] === '/applications/0/external-assets', calls)
			check('and the hosted link is used', sentImage(s) === 'mp:external/zzz/https/avatar.example.org/a.png', s.lastOf('a')?.activity)
			await s.restore()
		}
		{
			const calls = []
			const http = { HTTPResponseError: class {}, get() {}, post: async ({ url }) => { calls.push(url); return { body: [{ external_asset_path: 'external/yyy/https/avatar.example.org/b.png' }] } } }
			const s = await setup({
				profiles: [prof('a', { applicationId: '', largeImage: LINK })],
				before: runtime => runtime.valenced.modules.finders.loadModule(http),
			})
			check('with no application id the image is hosted under application 0 only', calls.length === 1 && calls[0] === '/applications/0/external-assets' && sentImage(s) === 'mp:external/yyy/https/avatar.example.org/b.png', [calls, sentImage(s)])
			await s.restore()
		}
	}


	globalThis.setTimeout = realSetTimeout
	Date.now = realNow
	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
