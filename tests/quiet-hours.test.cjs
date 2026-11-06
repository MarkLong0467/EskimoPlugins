'use strict'

/**
 * Tests for Quiet Hours. Run with: node tests/quiet-hours.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * The clock is fake: `Date.now` returns `clock.now`, and the plugin's interval is captured so a test can make it look at
 * the clock whenever it likes. 6 November 2026 is a Friday.
 */

const fs = require('node:fs')
const path = require('node:path')
const { createReporter, createRuntime, loadPlugin, findNode, findNodes, textOf, sleep, ROOT } = require('./lib/harness.cjs')

const { check, done } = createReporter('Quiet Hours')

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const SECRET = 'my private custom status'

/** A local time on the given day of November 2026 (6 is a Friday, 7 a Saturday). */
const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute, 0, 0).getTime()

const realNow = Date.now
const clock = { now: at(6, 12) }
Date.now = () => clock.now

/** A fake of one of Discord's proto settings. */
function fakeSetting(initial, calls, name) {
	const s = { value: initial, getSetting: () => s.value }
	s.updateSetting = v => {
		calls.push([name, v])
		s.value = v
		return Promise.resolve()
	}
	return s
}

/** A fake Discord with the plugin running. */
async function setup({ saved = {}, status = 'online', expires = '0', custom, now = at(6, 12) } = {}) {
	clock.now = now
	const intervals = []
	const realSetInterval = globalThis.setInterval
	globalThis.setInterval = fn => {
		intervals.push(fn)
		return intervals.length
	}
	const calls = []
	const mods = {
		StatusSetting: fakeSetting(status, calls, 'status'),
		StatusExpiresAtSetting: fakeSetting(expires, calls, 'expires'),
		StatusCreatedAtSetting: fakeSetting('0', calls, 'created'),
		CustomStatusSetting: fakeSetting(custom, calls, 'custom'),
	}
	const copied = []
	const runtime = createRuntime({
		stores: { SelfPresenceStore: { getStatus: () => mods.StatusSetting.value } },
		overrides: {
			externals: { ReactNativeClipboard: { Clipboard: { setString: text => copied.push(text) } } },
			discord: { native: { ClientInfoModule: { getConstants: () => ({ Version: '354.5', Build: '354205', ReleaseChannel: 'stable' }) } } },
		},
	}).install()
	runtime.valenced.modules.finders.loadModule(mods)
	const { definition } = loadPlugin('quiet-hours')
	const storage = runtime.makeStorage({ ...saved })
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'quiet-hours', 'manifest.json'), 'utf8'))
	const cleanups = []
	const errors = []
	const plugin = { manifest: { ...manifest, version: { nums: [1, 0, 0] } }, errors, reportError: e => errors.push(e), requireReload() {}, startedLate: false }
	const api = { cleanup: (...fns) => cleanups.push(...fns), decorate() {}, jsonStorage: storage, logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, plugin, unscoped: runtime.valenced }
	plugin.api = api
	await definition.start.call(plugin, { ...api, plugin })
	globalThis.setInterval = realSetInterval

	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	/** Lets the plugin look at the clock, as its interval does. */
	const look = (time = clock.now) => {
		clock.now = time
		for (const fn of intervals) fn()
	}
	const set = async patch => {
		await storage.set(patch)
	}
	const stop = () => {
		for (const cleanup of [...cleanups].reverse()) if (typeof cleanup === 'function') cleanup()
	}
	const writes = name => calls.filter(c => c[0] === name).map(c => c[1])
	const opened = key => runtime.log.actions.filter(a => a.label === 'actionSheet' && a.name === 'openLazy' && a.args[1] === key)
	const mountSettings = async () => {
		const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api }))
		await view.settle()
		return view
	}
	const mountSheet = async key => {
		const call = opened(key).at(-1)
		const Component = (await call.args[0]).default
		const view = runtime.mount(runtime.React.createElement(Component, {}))
		await view.settle()
		return view
	}
	return { runtime, mods, calls, storage, copied, errors, toasts, look, set, stop, writes, opened, mountSettings, mountSheet, definition, api }
}

const btn = (view, text) => findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === text)
const applied = s => (s.storage.cache.appliedJson ? JSON.parse(s.storage.cache.appliedJson) : null)

;(async () => {
	// --- The plugin starts and does nothing until it is turned on
	{
		const s = await setup({ now: at(6, 23, 30) })
		s.look()
		check('with the schedule off nothing is written', s.calls.length === 0, s.calls)
		check('nothing is applied', applied(s) === null)
		s.stop()
	}

	// --- A night begins and ends
	{
		const s = await setup({ saved: { enabled: true }, status: 'idle', now: at(6, 22) })
		s.look(at(6, 22, 30))
		check('before the start nothing changes', s.mods.StatusSetting.value === 'idle' && s.calls.length === 0, s.calls)

		s.look(at(6, 23, 1))
		check('at 11 PM the status is Do Not Disturb', s.mods.StatusSetting.value === 'dnd', s.mods.StatusSetting.value)
		check('the status ends when the night does (7 AM Saturday), so Discord ends it by itself', s.mods.StatusExpiresAtSetting.value === String(at(7, 7)), s.mods.StatusExpiresAtSetting.value)
		const held = applied(s)
		check('what you had before is kept', held && held.before.status === 'idle' && held.end === at(7, 7), held)
		check('a toast says until when', s.toasts().some(t => /Quiet hours on until Tomorrow 7:00 AM/.test(t)), s.toasts())

		const writesBefore = s.calls.length
		s.look(at(7, 1))
		s.look(at(7, 6, 59))
		check('while the night lasts it does not write again', s.calls.length === writesBefore, s.calls.length - writesBefore)

		s.look(at(7, 7, 0))
		check('at 7 AM the old status is back', s.mods.StatusSetting.value === 'idle', s.mods.StatusSetting.value)
		check('the saved state is cleared', applied(s) === null)
		check('a toast says it ended', s.toasts().some(t => /Quiet hours ended/.test(t)), s.toasts())

		s.look(at(7, 12))
		check('in the daytime nothing happens', s.mods.StatusSetting.value === 'idle')
		s.look(at(7, 23, 5))
		check('the next night starts again', s.mods.StatusSetting.value === 'dnd')
		s.stop()
	}

	// --- Opening Discord in the middle of the night
	{
		const s = await setup({ saved: { enabled: true }, now: at(7, 3) })
		s.look(at(7, 3))
		check('opening Discord at 3 AM starts the night that began yesterday', s.mods.StatusSetting.value === 'dnd' && applied(s)?.end === at(7, 7), applied(s))
		s.stop()
	}

	// --- Discord was closed all night
	{
		const held = { end: at(7, 7), at: at(6, 23), status: 'dnd', before: { status: 'idle', expires: '0', custom: null }, custom: false }
		const s = await setup({ saved: { enabled: true, appliedJson: JSON.stringify(held) }, status: 'online', now: at(7, 9) })
		s.look(at(7, 9))
		check('after a night with Discord closed the old status comes back', s.mods.StatusSetting.value === 'idle', s.mods.StatusSetting.value)
		check('and the saved state is cleared', applied(s) === null)
		s.stop()
	}

	// --- Changing the status yourself
	{
		const s = await setup({ saved: { enabled: true }, now: at(6, 23, 10) })
		s.look()
		s.mods.StatusSetting.value = 'invisible'
		s.look(at(7, 2))
		check('a change you make in the night is not fought', s.mods.StatusSetting.value === 'invisible')
		s.look(at(7, 7, 5))
		check('at the end your own choice is left alone', s.mods.StatusSetting.value === 'invisible', s.mods.StatusSetting.value)
		check('and the saved state is cleared', applied(s) === null)
		s.stop()
	}

	// --- Days
	{
		const s = await setup({ saved: { enabled: true, days: [false, true, false, false, false, false, false] }, now: at(6, 23, 30) })
		s.look()
		check('a night that starts on a day that is off does nothing (Friday is off)', s.calls.length === 0)
		s.look(at(9, 23, 30))
		check('Monday night does start', s.mods.StatusSetting.value === 'dnd')
		s.look(at(10, 7, 1))
		check('and ends Tuesday morning', s.mods.StatusSetting.value === 'online')
		s.stop()
	}
	{
		const s = await setup({ saved: { enabled: true, days: [false, false, false, false, false, true, false] }, now: at(7, 2) })
		s.look()
		check('a Friday night is still on at 2 AM Saturday, though Saturday is off', s.mods.StatusSetting.value === 'dnd')
		s.stop()
	}
	{
		const s = await setup({ saved: { enabled: true, days: [false, false, false, false, false, false, false] }, now: at(6, 23, 30) })
		s.look()
		const view = await s.mountSettings()
		check('with no days on, nothing happens', s.calls.length === 0)
		check('and the card says nothing is scheduled', textOf(view.tree).includes('Nothing is scheduled'))
		view.unmount()
		s.stop()
	}

	// --- Daytime windows
	{
		const s = await setup({ saved: { enabled: true, from: 13 * 60, to: 15 * 60 }, now: at(6, 12) })
		s.look(at(6, 13, 30))
		check('a window within one day works (1 PM to 3 PM)', s.mods.StatusSetting.value === 'dnd' && applied(s)?.end === at(6, 15), applied(s))
		s.look(at(6, 15, 0))
		check('and ends the same day', s.mods.StatusSetting.value === 'online')
		s.stop()
	}
	{
		const s = await setup({ saved: { enabled: true, from: 600, to: 600 }, now: at(6, 10) })
		s.look()
		const view = await s.mountSettings()
		check('equal start and end times give no window', s.calls.length === 0 && textOf(view.tree).includes('Nothing is scheduled'))
		view.unmount()
		s.stop()
	}

	// --- Skip tonight
	{
		const s = await setup({ saved: { enabled: true }, now: at(6, 20) })
		const view = await s.mountSettings()
		check('before the night the card shows the next window', /Today 11:00 PM to Tomorrow 7:00 AM \(8 h\)/.test(textOf(view.tree)), textOf(view.tree).slice(0, 400))
		check('and offers Skip tonight', !!btn(view, 'Skip tonight'))
		btn(view, 'Skip tonight').props.onPress()
		await s.runtime.settle?.()
		check('skipping saves the end of that night', s.storage.cache.skippedEnd === at(7, 7), s.storage.cache.skippedEnd)
		s.look(at(6, 23, 30))
		check('that night does not start', s.mods.StatusSetting.value === 'online' && s.calls.length === 0, s.calls)
		s.look(at(7, 23, 30))
		check('the next night does', s.mods.StatusSetting.value === 'dnd')
		view.unmount()
		s.stop()
	}
	{
		const s = await setup({ saved: { enabled: true, skippedEnd: at(7, 7) }, now: at(6, 20) })
		const view = await s.mountSettings()
		check('a skipped night shows Undo skip', !!btn(view, 'Undo skip') && textOf(view.tree).includes('Skipping one night'))
		btn(view, 'Undo skip').props.onPress()
		check('undoing clears the skip', s.storage.cache.skippedEnd === 0)
		s.look(at(6, 23, 30))
		check('then the night starts', s.mods.StatusSetting.value === 'dnd')
		view.unmount()
		s.stop()
	}
	{
		const s = await setup({ saved: { enabled: true }, status: 'idle', now: at(6, 23, 30) })
		s.look()
		check('quiet hours are on', s.mods.StatusSetting.value === 'dnd')
		const view = await s.mountSettings()
		check('the card says they are on until 7 AM', textOf(view.tree).includes('Quiet hours are on') && textOf(view.tree).includes('Until Tomorrow 7:00 AM'), textOf(view.tree).slice(0, 300))
		btn(view, 'End now and skip tonight').props.onPress()
		check('ending now puts the old status back', s.mods.StatusSetting.value === 'idle', s.mods.StatusSetting.value)
		check('and skips the rest of the night', s.storage.cache.skippedEnd === at(7, 7) && applied(s) === null)
		s.look(at(6, 23, 45))
		check('it does not come back a moment later', s.mods.StatusSetting.value === 'idle')
		view.unmount()
		s.stop()
	}

	// --- Turning it off in the night
	{
		const s = await setup({ saved: { enabled: true }, status: 'idle', now: at(6, 23, 30) })
		s.look()
		await s.set({ enabled: false })
		s.look(at(6, 23, 40))
		check('turning the schedule off during the night puts the old status back', s.mods.StatusSetting.value === 'idle' && applied(s) === null, s.mods.StatusSetting.value)
		s.stop()
	}

	// --- The status to use
	for (const wanted of ['idle', 'invisible']) {
		const s = await setup({ saved: { enabled: true, status: wanted }, now: at(6, 23, 30) })
		s.look()
		check(`the status can be ${wanted}`, s.mods.StatusSetting.value === wanted)
		s.stop()
	}

	// --- Changing the times in the night
	{
		const s = await setup({ saved: { enabled: true }, now: at(6, 23, 30) })
		s.look()
		await s.set({ to: 5 * 60 })
		s.look(at(7, 1))
		check('moving the end earlier follows', applied(s)?.end === at(7, 5), applied(s))
		s.look(at(7, 5, 1))
		check('and the night ends at the new time', s.mods.StatusSetting.value === 'online' && applied(s) === null)
		s.stop()
	}

	// --- The custom status
	{
		const before = { text: 'at work', emojiName: '💼', emojiId: '0', expiresAtMs: '0' }
		const s = await setup({ saved: { enabled: true, showCustom: true, customText: SECRET, customEmoji: '🌙' }, custom: before, now: at(6, 23, 30) })
		s.look()
		const mine = s.mods.CustomStatusSetting.value
		check('the custom status is set for the night', mine && mine.text === SECRET && mine.emojiName === '🌙' && mine.expiresAtMs === String(at(7, 7)), mine)
		s.look(at(7, 7))
		const back = s.mods.CustomStatusSetting.value
		check('the old custom status comes back', back && back.text === 'at work' && back.emojiName === '💼', back)
		s.stop()
	}
	{
		const s = await setup({ saved: { enabled: true, showCustom: true, customText: SECRET }, now: at(6, 23, 30) })
		s.look()
		s.look(at(7, 7))
		check('with no custom status before, it is removed at the end', s.mods.CustomStatusSetting.value === undefined, s.mods.CustomStatusSetting.value)
		s.stop()
	}
	{
		const s = await setup({ saved: { enabled: true, showCustom: true, customText: SECRET }, now: at(6, 23, 30) })
		s.look()
		s.mods.CustomStatusSetting.value = { text: 'something new', emojiName: '', emojiId: '0', expiresAtMs: '0' }
		s.look(at(7, 7))
		check('a custom status you changed in the night is not touched', s.mods.CustomStatusSetting.value.text === 'something new')
		s.stop()
	}
	{
		const before = { text: 'keep me', emojiName: '', emojiId: '0', expiresAtMs: '0' }
		const s = await setup({ saved: { enabled: true, showCustom: false }, custom: before, now: at(6, 23, 30) })
		s.look()
		check('with the custom status off it is not touched', s.writes('custom').length === 0 && s.mods.CustomStatusSetting.value.text === 'keep me')
		s.stop()
	}


	// --- The settings screen
	{
		const s = await setup({ saved: { enabled: false } })
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		check('it shows the schedule rows', text.includes('Starts') && text.includes('11:00 PM') && text.includes('Ends') && text.includes('7:00 AM'), text.slice(0, 500))
		check('it says the end is the next morning', text.includes('(the next morning)'))
		check('it shows all seven day buttons', findNodes(view.tree, n => n.type === 'Design.Button' && ['S', 'M', 'T', 'W', 'F'].includes(n.props.text)).length === 7)
		check('it lists the three statuses', ['Do Not Disturb', 'Idle', 'Invisible'].every(l => findNodes(view.tree, n => n.props?.label === l).length === 1))
		check('it says the schedule is off', text.includes('Quiet hours are off'))
		check('it has the debugging section', text.includes('DEBUGGING') && !!btn(view, 'Copy logs'))
		check('it has no credits on the page', !/kmmiio|Made by|MarkLong/.test(text.replace('Quiet Hours', '')))
		view.unmount()
		s.stop()
	}
	{
		const s = await setup({ saved: { enabled: false } })
		let view = await s.mountSettings()
		const friday = findNodes(view.tree, n => n.type === 'Design.Button' && n.props.text === 'F')[0]
		friday.props.onPress()
		check('tapping a day turns it off', s.storage.cache.days[5] === false && s.storage.cache.days.filter(Boolean).length === 6, s.storage.cache.days)
		view.unmount()
		s.stop()
	}
	{
		const s = await setup({ saved: { enabled: false } })
		const view = await s.mountSettings()
		const row = findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Starts')
		row.props.onPress()
		await sleep(5)
		const sheet = await s.mountSheet('marklong.quiet-hours.time')
		check('the start row opens the time picker', textOf(sheet.tree).includes('Start quiet hours at') && textOf(sheet.tree).includes('11:00 PM'), textOf(sheet.tree))
		btn(sheet, '10').props.onPress()
		await sheet.settle()
		btn(sheet, '30').props.onPress()
		await sheet.settle()
		check('the picker shows the time as it is picked', textOf(sheet).includes?.('10:30 PM') || textOf(sheet.tree).includes('10:30 PM'), textOf(sheet.tree))
		btn(sheet, 'Save').props.onPress()
		check('saving sets the start (10:30 PM)', s.storage.cache.from === 22 * 60 + 30, s.storage.cache.from)
		sheet.unmount()
		view.unmount()
		s.stop()
	}
	{
		const s = await setup({ saved: { to: 6 * 60 + 45 } })
		const view = await s.mountSettings()
		findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Ends').props.onPress()
		await sleep(5)
		const sheet = await s.mountSheet('marklong.quiet-hours.time')
		check('the end picker starts at the saved time', textOf(sheet.tree).includes('End quiet hours at') && textOf(sheet.tree).includes('6:45 AM'), textOf(sheet.tree))
		btn(sheet, 'PM').props.onPress()
		await sheet.settle()
		btn(sheet, 'Save').props.onPress()
		check('AM and PM change the time (6:45 PM)', s.storage.cache.to === 18 * 60 + 45, s.storage.cache.to)
		sheet.unmount()
		view.unmount()
		s.stop()
	}
	{
		const s = await setup({ saved: { showCustom: true, customText: SECRET } })
		const view = await s.mountSettings()
		const inputs = findNodes(view.tree, n => n.type === 'Design.TextInput')
		check('the custom status fields show when it is on', inputs.length === 2)
		inputs[1].props.onChange('Sleeping')
		check('typing saves the text', s.storage.cache.customText === 'Sleeping')
		view.unmount()
		s.stop()
	}

	// --- Copy logs
	{
		const s = await setup({ saved: { enabled: true, showCustom: true, customText: SECRET }, now: at(6, 23, 30) })
		s.look()
		const view = await s.mountSettings()
		btn(view, 'Copy logs').props.onPress()
		await sleep(5)
		const report = s.copied.at(-1) || ''
		check('Copy logs puts a report on the clipboard', report.length > 200)
		check('the report names the plugin and credits the author', report.includes('marklong.quiet-hours 1.0.0') && report.includes('Made by MarkLong0467'))
		check('the report does not credit kmmiio99o', !report.includes('kmmiio99o'))
		check('the report shows the mode and what was applied', /Mode: on/.test(report) && /Applied: dnd since/.test(report), report.split('\n').slice(6, 22))
		check('the report holds no custom status text', !report.includes(SECRET))
		view.unmount()
		s.stop()
	}

	// --- Stopping
	{
		const s = await setup({ saved: { enabled: true }, now: at(6, 23, 30) })
		s.look()
		s.stop()
		check('stopping keeps the saved state so the night is ended later', applied(s) !== null)
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	Date.now = realNow
	done()
})()
