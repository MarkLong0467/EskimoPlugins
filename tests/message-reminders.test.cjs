'use strict'

/**
 * Tests for Message Reminders. Run with: node tests/message-reminders.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 */

const fs = require('node:fs')
const path = require('node:path')
const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, textOf, sleep, ROOT } = require('./lib/harness.cjs')

const { check, done } = createReporter('Message Reminders')

const MINUTE = 60_000
const SECRET = 'my secret message text'
const MESSAGE = { id: 'msg1', channel_id: 'chan1', content: `  ${SECRET}\n with   spaces `, author: { username: 'alice', globalName: 'Alice' } }

/** A fake Discord with the plugin running. `saved` is what the plugin has saved from an earlier session. */
async function setup({ saved = {}, guild = 'guild1' } = {}) {
	const copied = []
	const appStateHandlers = []
	const runtime = createRuntime({
		stores: { ChannelStore: { getChannel: id => (id === 'dm' ? { id, guild_id: null } : { id, guild_id: guild }) } },
		overrides: {
			externals: { ReactNativeClipboard: { Clipboard: { setString: text => copied.push(text) } } },
			discord: { native: { ClientInfoModule: { getConstants: () => ({ Version: '354.5', Build: '354205', ReleaseChannel: 'stable' }) } } },
		},
	}).install()
	const { valenced } = runtime
	valenced.assets.getAssetIdByName = name => (name === 'ClockIcon' ? 77 : name)
	valenced.react.ReactNative.AppState = {
		addEventListener: (type, fn) => {
			appStateHandlers.push(fn)
			return { remove() {} }
		},
		currentState: 'active',
	}
	globalThis.__opened = []
	const { definition } = loadPlugin('message-reminders')
	const storage = runtime.makeStorage({ menu: true, sheet: true, snoozeMinutes: 10, reminders: [], ...saved })
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'message-reminders', 'manifest.json'), 'utf8'))
	const cleanups = []
	const errors = []
	const plugin = { manifest: { ...manifest, version: { nums: [1, 0, 0] } }, errors, reportError: e => errors.push(e), requireReload() {}, startedLate: false }
	const api = { cleanup: (...fns) => cleanups.push(...fns), decorate() {}, jsonStorage: storage, logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, plugin, unscoped: runtime.valenced }
	plugin.api = api
	await definition.start.call(plugin, { ...api, plugin })
	const jsx = valenced.react.ReactJSXRuntime
	const usual = () => [
		{ label: 'Reply', id: 'r', key: 'r', action() {}, iconSource: 1 },
		{ label: 'Copy Text', id: 'c', key: 'c', action() {}, iconSource: 2 },
		{ label: 'Add Reaction', id: 'a', key: 'a', action() {}, iconSource: 3 },
	]
	const holdMessage = (items = usual(), message = MESSAGE) => {
		jsx.jsx('MessageActionsSheet', { message })
		return jsx.jsx('ActionSheet', { items })
	}
	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	const sheets = () => runtime.log.actions.filter(a => a.label === 'actionSheet')
	const opened = key => sheets().filter(a => a.name === 'openLazy' && a.args[1] === key)
	const mountSheet = async key => {
		const call = opened(key).at(-1)
		const Component = (await call.args[0]).default
		const view = runtime.mount(runtime.React.createElement(Component, {}))
		await view.settle()
		return view
	}
	/** Taps the menu item and mounts the time picker. */
	const openPicker = async (message = MESSAGE) => {
		const menu = holdMessage(usual(), message)
		menu.props.items.at(-1).action()
		await sleep(5)
		return mountSheet('marklong.message-reminders.pick')
	}
	const stored = () => storage.cache.reminders
	const stop = async () => {
		for (const cleanup of [...cleanups].reverse()) if (typeof cleanup === 'function') cleanup()
	}
	/** Pretends Discord came back to the front, which makes the plugin look for due reminders. */
	const comeToFront = () => appStateHandlers.forEach(fn => fn('active'))
	return { runtime, definition, plugin, api, storage, copied, holdMessage, usual, toasts, opened, mountSheet, openPicker, stored, stop, comeToFront, jsx }
}

const rowOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
const button = (view, text) => findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === text)
const reminder = (over = {}) => ({ id: 'r1', channelId: 'chan1', messageId: 'msg1', guildId: 'guild1', author: 'Alice', preview: 'hello there', at: Date.now() + 60 * MINUTE, createdAt: Date.now(), snoozes: 0, ...over })

;(async () => {
	// --- The menu
	{
		const s = await setup()
		const items = s.holdMessage().props.items
		check('Remind Me is added to the end of the message menu', items.length === 4 && items.at(-1).label === 'Remind Me', items.map(i => i.label))
		check('the new item does not keep the identity of the item it was copied from', items.at(-1).id === undefined && items.at(-1).key === undefined)
		check('the new item has the clock icon', items.at(-1).iconSource === 77)
		check('the other items are untouched', items[0].label === 'Reply' && items[2].id === 'a')
		check('a menu that has it already is left alone', s.jsx.jsx('ActionSheet', { items }).props.items.length === 4)
		const other = s.jsx.jsx('ActionSheet', { items: [{ label: 'Block', action() {} }, { label: 'Mute', action() {} }] })
		check('a menu that is not the message menu is left alone', other.props.items.length === 2)
		await s.stop()
		check('after stopping the menu is no longer changed', s.holdMessage().props.items.length === 3)
	}
	{
		const s = await setup({ saved: { menu: false } })
		check('with the setting off nothing is added', s.holdMessage().props.items.length === 3)
		await s.stop()
	}
	{
		const s = await setup()
		s.jsx.jsx('Unrelated', {})
		const menu = s.jsx.jsx('ActionSheet', { items: s.usual() })
		menu.props.items.at(-1).action()
		await sleep(5)
		check('tapping Remind Me without a noted message says so instead of opening the picker', s.opened('marklong.message-reminders.pick').length === 0 && s.toasts().some(t => /Could not tell which message/.test(t)), s.toasts())
		await s.stop()
	}

	// --- The picker
	{
		const s = await setup()
		const view = await s.openPicker()
		check('tapping the item opens the picker', !!view)
		const labels = findNodes(view.tree, n => n.type === 'Design.TableRow').map(n => n.props.label)
		check('the picker offers the usual times', ['In 10 minutes', 'In 30 minutes', 'In 1 hour', 'In 3 hours', 'Tomorrow morning', 'In a week'].every(l => labels.includes(l)), labels)
		check('the picker shows who wrote the message and the start of it on one line', textOf(view.tree).includes('Alice: my secret message text with spaces'), textOf(view.tree))
		const before = Date.now()
		rowOf(view, 'In 30 minutes').props.onPress()
		await view.settle()
		const saved = s.stored()
		check('picking a time saves one reminder', saved.length === 1, saved)
		const r = saved[0]
		check('the reminder is for the right message in the right server', r.channelId === 'chan1' && r.messageId === 'msg1' && r.guildId === 'guild1', r)
		check('the reminder keeps the writer and a one-line preview', r.author === 'Alice' && r.preview === 'my secret message text with spaces', r)
		check('the reminder is due 30 minutes from now', r.at >= before - 5000 + 30 * MINUTE && r.at <= Date.now() + 30 * MINUTE, r.at - before)
		check('a toast says when', s.toasts().some(t => /Reminder set for/.test(t)), s.toasts())
		check('the sheet is closed', s.runtime.log.actions.some(a => a.label === 'actionSheet' && a.name === 'hideActionSheet' && a.args[0] === 'marklong.message-reminders.pick'))
		await s.stop()
	}
	{
		const s = await setup()
		let view = await s.openPicker()
		const minutes = findNode(view.tree, n => n.type === 'Design.TextInput')
		minutes.props.onChange('45x')
		await view.settle()
		check('the custom time takes digits only', findNode(view.tree, n => n.type === 'Design.TextInput').props.value === '45')
		check('the custom time shows what time it makes', /That is /.test(textOf(view.tree)), textOf(view.tree))
		const before = Date.now()
		button(view, 'Set reminder').props.onPress()
		const r = s.stored()[0]
		check('a custom number of minutes is used', r && Math.abs(r.at - (before + 45 * MINUTE)) < 5000, r)
		view.unmount()
		// Picking again moves the same reminder.
		view = await s.openPicker()
		check('a message that has a reminder says so', /Reminder set for/.test(textOf(view.tree)))
		check('and offers to remove it', !!button(view, 'Remove the reminder'))
		rowOf(view, 'In 1 hour').props.onPress()
		check('picking again moves it instead of adding another', s.stored().length === 1 && s.toasts().some(t => /^Moved to/.test(t)), s.stored())
		view.unmount()
		view = await s.openPicker()
		button(view, 'Remove the reminder').props.onPress()
		check('Remove the reminder removes it', s.stored().length === 0)
		await s.stop()
	}
	{
		const s = await setup()
		const view = await s.openPicker()
		check('Set reminder is off until the minutes make sense', button(view, 'Set reminder').props.disabled === true)
		findNode(view.tree, n => n.type === 'Design.TextInput').props.onChange('0')
		await view.settle()
		check('zero minutes is not accepted', button(view, 'Set reminder').props.disabled === true)
		findNode(view.tree, n => n.type === 'Design.TextInput').props.onChange('9999999')
		await view.settle()
		check('too many minutes is not accepted', button(view, 'Set reminder').props.disabled === true)
		await s.stop()
	}
	{
		const s = await setup()
		const view = await s.openPicker({ id: 'm2', channel_id: 'dm', content: '' })
		rowOf(view, 'In 10 minutes').props.onPress()
		const r = s.stored()[0]
		check('a message in a direct message has no server', r.guildId === null, r)
		check('a message without text still gets a reminder', r.preview === '' && r.author === '', r)
		await s.stop()
	}

	// --- Due reminders
	{
		const s = await setup({ saved: { reminders: [reminder({ id: 'late', at: Date.now() - 5 * MINUTE })] } })
		s.comeToFront()
		await sleep(5)
		check('a reminder that is due makes a toast when Discord comes to the front', s.toasts().some(t => /Reminder: hello there/.test(t)), s.toasts())
		check('and opens the due sheet', s.opened('marklong.message-reminders.due').length === 1)
		s.comeToFront()
		await sleep(5)
		check('the same reminder is announced only once', s.toasts().filter(t => /Reminder: hello there/.test(t)).length === 1 && s.opened('marklong.message-reminders.due').length === 1)
		const view = await s.mountSheet('marklong.message-reminders.due')
		check('the due sheet shows the writer, the text and how late it is', ['Alice', 'hello there', 'Was due 5 min ago'].every(t => textOf(view.tree).includes(t)), textOf(view.tree))
		button(view, 'Snooze 10 min').props.onPress()
		await view.settle()
		const snoozed = s.stored()[0]
		check('Snooze moves the reminder 10 minutes on and counts it', snoozed.snoozes === 1 && snoozed.at > Date.now() + 9 * MINUTE && snoozed.at < Date.now() + 11 * MINUTE, snoozed)
		view.unmount()
		await s.stop()
	}
	{
		const s = await setup({ saved: { reminders: [reminder({ at: Date.now() - MINUTE })] } })
		s.comeToFront()
		await sleep(5)
		const view = await s.mountSheet('marklong.message-reminders.due')
		button(view, 'Done').props.onPress()
		await view.settle()
		check('Done removes the reminder', s.stored().length === 0)
		check('and the sheet closes when none are left', s.runtime.log.actions.some(a => a.name === 'hideActionSheet' && a.args[0] === 'marklong.message-reminders.due'))
		view.unmount()
		await s.stop()
	}
	{
		const s = await setup({ saved: { reminders: [reminder({ at: Date.now() - MINUTE })] } })
		s.comeToFront()
		await sleep(5)
		const view = await s.mountSheet('marklong.message-reminders.due')
		await button(view, 'Jump to message').props.onPress()
		await sleep(5)
		check('Jump opens the message in Discord', globalThis.__opened.at(-1) === 'https://discord.com/channels/guild1/chan1/msg1', globalThis.__opened)
		check('and removes the reminder', s.stored().length === 0)
		view.unmount()
		await s.stop()
	}
	{
		const s = await setup({ saved: { reminders: [reminder({ at: Date.now() - MINUTE, guildId: null, channelId: 'dm' })] } })
		s.comeToFront()
		await sleep(5)
		const view = await s.mountSheet('marklong.message-reminders.due')
		await button(view, 'Jump to message').props.onPress()
		await sleep(5)
		check('a direct message links through @me', globalThis.__opened.at(-1) === 'https://discord.com/channels/@me/dm/msg1', globalThis.__opened)
		view.unmount()
		await s.stop()
	}
	{
		const s = await setup({ saved: { reminders: [reminder({ id: 'a', at: Date.now() - 3 * MINUTE }), reminder({ id: 'b', messageId: 'm2', at: Date.now() - 2 * MINUTE }), reminder({ id: 'c', messageId: 'm3', at: Date.now() + 60 * MINUTE })] } })
		s.comeToFront()
		await sleep(5)
		check('several due reminders make one toast that counts them', s.toasts().some(t => /2 reminders are due/.test(t)), s.toasts())
		check('a reminder that is not due is not announced', s.opened('marklong.message-reminders.due').length === 1)
		await s.stop()
	}
	{
		const s = await setup({ saved: { sheet: false, reminders: [reminder({ at: Date.now() - MINUTE })] } })
		s.comeToFront()
		await sleep(5)
		check('with the sheet switched off only a toast is shown', s.toasts().length >= 1 && s.opened('marklong.message-reminders.due').length === 0)
		await s.stop()
	}
	{
		const s = await setup({ saved: { reminders: [reminder({ at: Date.now() + 60 * MINUTE })] } })
		s.comeToFront()
		await sleep(5)
		check('a reminder in the future is left alone', s.toasts().length === 0)
		await s.stop()
	}
	{
		const s = await setup({ saved: { reminders: [{ nonsense: true }, null, reminder()] } })
		const view = await settings(s)
		const titles = findNodes(view.tree, n => n.type === 'Design.TableRowGroup').map(n => n.props.title)
		check('saved reminders that are broken are ignored and the settings still draw', titles.includes('Coming up (1)'), titles)
		view.unmount()
		await s.stop()
	}

	// --- The settings screen
	{
		const s = await setup()
		const view = await settings(s)
		check('with no reminders the settings say so', !!rowOf(view, 'No reminders yet'))
		check('the settings explain that reminders need Discord open', /only come while Discord is open/.test(textOf(view.tree)))
		check('the settings end with the debugging section', !!button(view, 'Copy logs') && !!button(view, 'Run self-check'))
		check('the settings carry no credit card', !textOf(view.tree).includes('kmmiio'))
		view.unmount()
		await s.stop()
	}
	{
		const s = await setup({ saved: { reminders: [reminder({ id: 'a', preview: 'later one', at: Date.now() + 3 * 60 * MINUTE }), reminder({ id: 'b', messageId: 'm2', preview: 'late one', at: Date.now() - 2 * MINUTE })] } })
		const view = await settings(s)
		const titles = findNodes(view.tree, n => n.type === 'Design.TableRowGroup').map(n => n.props.title)
		check('due reminders and coming ones are in separate lists', titles.includes('Due now (1)') && titles.includes('Coming up (1)'), titles)
		const row = rowOf(view, 'late one')
		check('a row shows the writer and when it was due', /Alice · Due 2 min ago/.test(row.props.subLabel), row && row.props.subLabel)
		row.props.onPress()
		await sleep(5)
		const item = await s.mountSheet('marklong.message-reminders.item')
		check('tapping a row opens the reminder', textOf(item.tree).includes('late one'))
		button(item, 'Snooze 10 min').props.onPress()
		await item.settle()
		check('Snooze there moves it 10 minutes after its time', s.stored().find(r => r.id === 'b').at > Date.now() + 7 * MINUTE)
		button(item, 'Remove').props.onPress()
		await item.settle()
		check('Remove there removes it', s.stored().length === 1 && s.stored()[0].id === 'a')
		check('the list is updated', !rowOf((await redraw(view)), 'late one'))
		view.unmount()
		item.unmount()
		await s.stop()
	}
	{
		const s = await setup()
		const view = await settings(s)
		const switches = findNodes(view.tree, n => n.type === 'Design.TableSwitchRow')
		switches[0].props.onValueChange(false)
		await sleep(5)
		check('the menu switch is saved', s.storage.cache.menu === false)
		const radios = findNode(view.tree, n => n.type === 'Design.TableRadioGroup')
		radios.props.onChange('30')
		await sleep(5)
		check('the snooze length is saved', s.storage.cache.snoozeMinutes === 30)
		view.unmount()
		await s.stop()
	}

	// --- The report
	{
		const s = await setup({ saved: { reminders: [reminder({ preview: SECRET, author: 'Alice Wonderland' })] } })
		const view = await settings(s)
		button(view, 'Copy logs').props.onPress()
		await view.settle()
		const report = s.copied.at(-1) ?? ''
		check('Copy logs puts a report on the clipboard', report.length > 200)
		check('the report names the plugin and credits the author', report.includes('marklong.message-reminders 1.0.0') && report.includes('Made by MarkLong0467'))
		check('the report does not credit kmmiio99o', !report.includes('kmmiio99o'))
		check('the report has the counts', /reminders": 1/.test(report) && /dueNow": 0/.test(report), report.split('\n').slice(8, 20))
		check('the report holds no message text or names', !report.includes(SECRET) && !report.includes('Wonderland'))
		view.unmount()
		await s.stop()
	}

	// --- Stopping
	{
		const s = await setup({ saved: { reminders: [reminder()] } })
		await s.stop()
		check('stopping keeps the saved reminders', s.stored().length === 1)
	}

	done()

	/** Mounts the settings screen. */
	async function settings(s) {
		const Settings = s.definition.SettingsComponent
		const view = s.runtime.mount(s.runtime.React.createElement(Settings, { api: s.api }))
		await view.settle()
		return view
	}
	async function redraw(view) {
		await view.settle()
		return view
	}
})()
