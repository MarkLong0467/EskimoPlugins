'use strict'

/**
 * Tests for Text React. Run with: node tests/text-react.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Text React')

const SHEET_KEY = 'marklong.text-react'
const MESSAGE = { id: 'msg1', channel_id: 'chan1' }
const put = (channel, message, emoji) => `/channels/${channel}/messages/${message}/reactions/${encodeURIComponent(emoji)}/@me`

/**
 * Builds a fake Discord with a web connection that records every PUT, and the plugin running. `answer(url, n)` can make
 * a request fail by returning an error to throw.
 */
async function setup({ saved = {}, answer = () => undefined, token = null, withHttp = true } = {}) {
	const runtime = createRuntime().install()
	const { valenced } = runtime
	valenced.assets.getAssetIdByName = name => (name === 'KeyboardIcon' ? 99 : name)
	const urls = []
	let count = 0
	if (withHttp) {
		runtime.finders.loadModule({
			HTTPResponseError: class {},
			put: async ({ url }) => {
				urls.push(url)
				const error = answer(url, count++)
				if (error) throw error
			},
		})
	}
	if (token) runtime.finders.loadModule({ getToken: () => token })

	const { definition } = loadPlugin('text-react')
	const storage = runtime.makeStorage({ delaySeconds: '0.5', ...saved })
	const running = await startPlugin(definition, runtime, { storage })
	const jsx = valenced.react.ReactJSXRuntime

	/** What the long-press menu of a message is made of: the message is noted, then the list of items is drawn. */
	const holdMessage = (items, message = MESSAGE) => {
		jsx.jsx('MessageActionsSheet', { message })
		return jsx.jsx('ActionSheet', { items })
	}
	const usual = () => [
		{ label: 'Reply', id: 'r', key: 'r', action() {}, iconSource: 1 },
		{ label: 'Copy Text', id: 'c', key: 'c', action() {}, iconSource: 2 },
		{ label: 'Add Reaction', id: 'a', key: 'a', action() {}, iconSource: 3 },
	]
	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	const sheets = () => runtime.log.actions.filter(a => a.label === 'actionSheet')
	/** Taps the new item and mounts the sheet it opens. */
	const openSheet = async () => {
		const menu = holdMessage(usual())
		menu.props.items.at(-1).action()
		await sleep(5)
		const call = sheets().filter(a => a.name === 'openLazy').at(-1)
		const Component = (await call.args[0]).default
		const view = runtime.mount(runtime.React.createElement(Component, {}))
		await view.settle()
		return { view, call }
	}
	const type = async (view, text) => {
		findNode(view.tree, n => n.type === 'Design.TextInput').props.onChange(text)
		await view.settle()
	}
	const button = (view, text) => findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === text)
	return { runtime, running, definition, storage, urls, holdMessage, usual, toasts, sheets, openSheet, type, button, jsx }
}

;(async () => {
	// --- The menu
	{
		const s = await setup()
		const menu = s.holdMessage(s.usual())
		const items = menu.props.items
		check('Text React is added to the end of the message menu', items.length === 4 && items[3].label === 'Text React', items.map(i => i.label))
		check('the new item does not keep the identity of the item it was copied from', items[3].id === undefined && items[3].key === undefined)
		check('the new item has the keyboard icon', items[3].iconSource === 99)
		check('the other items are untouched', items[0].label === 'Reply' && items[2].id === 'a')
		const again = s.jsx.jsx('ActionSheet', { items })
		check('a menu that has it already is left alone', again.props.items.length === 4)
		await s.running.stop()
		check('after stopping the menu is no longer changed', s.holdMessage(s.usual()).props.items.length === 3)
	}
	{
		const s = await setup()
		const other = s.jsx.jsx('ActionSheet', { items: [{ label: 'Block', action() {} }, { label: 'Mute', action() {} }] })
		check('a menu that is not the message menu is left alone', other.props.items.length === 2)
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { menu: false } })
		check('with the setting off nothing is added', s.holdMessage(s.usual()).props.items.length === 3)
		await s.running.stop()
	}
	{
		// Another language: the menu is found by its icons.
		const s = await setup()
		s.runtime.valenced.assets.AssetsRegistry = { getAssetByID: id => ({ 11: { name: 'ReplyIcon' }, 12: { name: 'CopyIcon' }, 13: { name: 'PinIcon' } })[id] }
		const menu = s.holdMessage([
			{ label: 'Répondre', action() {}, iconSource: 11 },
			{ label: 'Copier', action() {}, iconSource: 12 },
			{ label: 'Épingler', action() {}, iconSource: 13 },
		])
		check('the message menu is found by its icons in any language', menu.props.items.length === 4, menu.props.items.map(i => i.label))
		await s.running.stop()
	}
	{
		const s = await setup()
		const menu = s.holdMessage(s.usual(), {})
		menu.props.items.at(-1).action()
		await sleep(5)
		check('without a message the person is told to try again', s.toasts().includes('Could not tell which message that was. Hold the message and try again') && s.sheets().every(a => a.name !== 'openLazy'), s.toasts())
		await s.running.stop()
	}

	// --- The sheet and the reactions
	{
		const s = await setup()
		const { view, call } = await s.openSheet()
		check('tapping the item closes the menu first', s.sheets().some(a => a.name === 'hideAllActionSheets'))
		check('the sheet opens with the plugin\'s key', call.args[1] === SHEET_KEY)
		check('the React button waits for some text', s.button(view, 'React').props.disabled === true)
		await s.type(view, 'ok')
		check('...and works once there is some', s.button(view, 'React').props.disabled === false)
		s.button(view, 'React').props.onPress()
		await sleep(80)
		check('"ok" is one reaction: the OK button', JSON.stringify(s.urls) === JSON.stringify([put('chan1', 'msg1', '🆗')]), s.urls)
		check('the sheet closes', s.sheets().some(a => a.name === 'hideActionSheet' && a.args[0] === SHEET_KEY))
		check('a toast says how many were added', s.toasts().includes('Added 1 reaction'), s.toasts())
		await s.running.stop()
	}
	{
		const s = await setup()
		const { view } = await s.openSheet()
		await s.type(view, 'Hi')
		s.button(view, 'React').props.onPress()
		await sleep(900)
		check('capital letters are the same as small ones, and reactions go in order', JSON.stringify(s.urls) === JSON.stringify([put('chan1', 'msg1', '🇭'), put('chan1', 'msg1', '🇮')]), s.urls)
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { delaySeconds: '0.5' } })
		const { view } = await s.openSheet()
		await s.type(view, 'aa')
		s.button(view, 'React').props.onPress()
		await sleep(900)
		check('a second letter uses its look-alike', JSON.stringify(s.urls.map(decodeURIComponent)) === JSON.stringify([put('chan1', 'msg1', '🇦'), put('chan1', 'msg1', '🅰')].map(decodeURIComponent)), s.urls)
		await s.running.stop()
	}
	{
		// Every text starts with all the emoji again.
		const s = await setup()
		for (let round = 0; round < 2; round++) {
			const { view } = await s.openSheet()
			await s.type(view, 'b')
			s.button(view, 'React').props.onPress()
			await sleep(80)
		}
		check('a second text can use the same letters again', s.urls.length === 2 && s.urls[0] === s.urls[1], s.urls)
		await s.running.stop()
	}
	for (const [text, first] of [['100', '💯'], ['abc', '🔤'], ['ab', '🆎'], ['!!', '‼']]) {
		const s = await setup()
		const { view } = await s.openSheet()
		await s.type(view, text)
		s.button(view, 'React').props.onPress()
		await sleep(80)
		check(`"${text}" starts with ${first}`, s.urls[0] === put('chan1', 'msg1', first), s.urls)
		await s.running.stop()
	}
	{
		const s = await setup()
		const { view } = await s.openSheet()
		await s.type(view, 'a b')
		s.button(view, 'React').props.onPress()
		await sleep(1400)
		check('a space inside the text becomes a small square', s.urls[1] === put('chan1', 'msg1', '▪'), s.urls)
		await s.running.stop()
	}
	{
		// Text with characters that have no emoji: the sheet asks first.
		const s = await setup()
		const { view } = await s.openSheet()
		await s.type(view, 'a~')
		s.button(view, 'React').props.onPress()
		await view.settle()
		check('part of the text without an emoji asks before reacting', s.urls.length === 0 && !!button(view, 'React anyway'), s.urls)
		function button(v, t) {
			return s.button(v, t)
		}
		s.button(view, 'Go back').props.onPress()
		await view.settle()
		check('"Go back" returns to the text', !!findNode(view.tree, n => n.type === 'Design.TextInput'))
		s.button(view, 'React').props.onPress()
		await view.settle()
		s.button(view, 'React anyway').props.onPress()
		await sleep(80)
		check('"React anyway" leaves the character out', s.urls.length === 1 && s.urls[0] === put('chan1', 'msg1', '🇦'), s.urls)
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { warn: false } })
		const { view } = await s.openSheet()
		await s.type(view, 'a~')
		s.button(view, 'React').props.onPress()
		await sleep(80)
		check('with the warning off it reacts straight away', s.urls.length === 1, s.urls)
		await s.running.stop()
	}
	{
		const s = await setup()
		const { view } = await s.openSheet()
		await s.type(view, '~~')
		s.button(view, 'React').props.onPress()
		check('text with no emoji at all is refused', s.toasts().includes('None of that text can be turned into reactions') && s.urls.length === 0, s.toasts())
		await s.type(view, 'abcdefghijklmnopqrstuvwxyz')
		s.button(view, 'React').props.onPress()
		check('text with more than 20 reactions is refused', s.toasts().some(t => /A message holds at most 20/.test(t)) && s.urls.length === 0, s.toasts())
		s.button(view, 'Cancel').props.onPress()
		check('Cancel closes the sheet and says so', s.toasts().includes('Cancelled'))
		await s.running.stop()
	}

	// --- Discord's answers
	{
		const s = await setup({ answer: () => Object.assign(new Error('x'), { status: 403, body: { message: 'Missing Permissions' } }) })
		const { view } = await s.openSheet()
		await s.type(view, 'ab')
		s.button(view, 'React').props.onPress()
		await sleep(900)
		check('a refused reaction stops the rest and says so', s.urls.length === 1 && s.toasts().includes("You can't add reactions in this channel"), s.toasts())
		await s.running.stop()
	}
	{
		const s = await setup({ answer: (url, n) => (n === 0 ? Object.assign(new Error('x'), { status: 429, body: { retry_after: 0.1 } }) : undefined) })
		const { view } = await s.openSheet()
		await s.type(view, 'x')
		s.button(view, 'React').props.onPress()
		await sleep(600)
		check('when Discord says to slow down it waits and tries again', s.urls.length === 2 && s.urls[0] === s.urls[1] && s.toasts().includes('Added 1 reaction'), s.urls)
		await s.running.stop()
	}
	{
		const s = await setup({ answer: (url, n) => (n === 0 ? Object.assign(new Error('x'), { status: 400, body: { message: 'Unknown Emoji' } }) : undefined) })
		const { view } = await s.openSheet()
		await s.type(view, 'tm')
		s.button(view, 'React').props.onPress()
		await sleep(300)
		check('an unknown emoji is tried again with the presentation selector', s.urls.length === 2 && decodeURIComponent(s.urls[1]).endsWith('™️/@me'), s.urls.map(decodeURIComponent))
		await s.running.stop()
	}
	{
		const s = await setup({ answer: () => Object.assign(new Error('boom'), { status: 500 }) })
		const { view } = await s.openSheet()
		await s.type(view, 'x')
		s.button(view, 'React').props.onPress()
		await sleep(80)
		check('another error is shown', s.toasts().some(t => t.startsWith('Could not add a reaction')), s.toasts())
		await s.running.stop()
	}
	{
		// Without Discord's own connection the account token is used.
		const calls = []
		const realFetch = globalThis.fetch
		globalThis.fetch = async (url, init) => (calls.push({ url: String(url), method: init?.method, auth: init?.headers?.Authorization }), { ok: true, status: 200 })
		const s = await setup({ withHttp: false, token: 'TOKEN' })
		const { view } = await s.openSheet()
		await s.type(view, 'x')
		s.button(view, 'React').props.onPress()
		await sleep(80)
		globalThis.fetch = realFetch
		check('without Discord\'s connection a plain PUT with the token is sent', calls.length === 1 && calls[0].method === 'PUT' && calls[0].auth === 'TOKEN' && calls[0].url === 'https://discord.com/api/v9' + put('chan1', 'msg1', '🇽'), calls)
		await s.running.stop()
	}
	{
		// Stopping the plugin stops the reactions that are still to come.
		const s = await setup({ saved: { delaySeconds: '2' } })
		const { view } = await s.openSheet()
		await s.type(view, 'abc')
		s.button(view, 'React').props.onPress()
		await sleep(80)
		await s.running.stop()
		await sleep(2400)
		check('stopping the plugin stops the reactions', s.urls.length === 1, s.urls)
	}

	// --- The settings screen
	{
		const s = await setup({ saved: { warn: false } })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		const rows = view.tree && require('./lib/harness.cjs').findNodes(view.tree, n => n.type === 'Design.TableSwitchRow')
		check('there are two switches, showing what is saved', rows.length === 2 && rows[0].props.value === true && rows[1].props.value === false, rows.map(r => r.props.value))
		rows[0].props.onValueChange(false)
		check('a switch is saved', s.storage.cache.menu === false, s.storage.cache)
		const group = findNode(view.tree, n => n.type === 'Design.TableRadioGroup')
		check('the pause is chosen from a list', group.props.value === '0.5')
		group.props.onChange('2')
		check('a pause is saved', s.storage.cache.delaySeconds === '2')
		check('the credit is shown', !!findNode(view.tree, n => n.props?.label === 'Credit' && /ArjixWasTaken/.test(n.props.subLabel)))
		await s.running.stop()
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
