'use strict'

/**
 * Tests for Text React. Run with: node tests/text-react.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, sleep } = require('./lib/harness.cjs')

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

	// --- The menu drawn as boxes of rows, as in the real message menu
	{
		const s = await setup()
		const row = (label, icon) => ({ type: 'MenuRow', props: { label, onPress() {}, icon: { type: { name: icon } } } })
		jsxNote(s)
		function jsxNote(setupResult) {
			setupResult.jsx.jsx('MessageActionsSheet', { message: MESSAGE })
		}
		const reply = s.jsx.jsx('Group', { children: [row('Reply', 'ReplyIcon'), row('Forward', 'ForwardIcon')] })
		const copy = s.jsx.jsx('Group', { children: [row('Copy Text', 'CopyIcon'), row('Message', 'ChatIcon'), row('Mention', 'AtIcon'), row('Copy Message Link', 'LinkIcon')] })
		const timezone = s.jsx.jsx('Group', { children: [row('Set their timezone...', 'ClockIcon')] })
		const labels = group => [group.props.children].flat().map(r => r.props.label)
		check('Text React goes at the end of the box with the copy rows', JSON.stringify(labels(copy)) === JSON.stringify(['Copy Text', 'Message', 'Mention', 'Copy Message Link', 'Text React']), labels(copy))
		check('the other boxes are left alone', labels(reply).length === 2 && labels(timezone).length === 1)
		const added = [copy.props.children].flat().at(-1)
		check('the new row is a copy of a row of its box, with its own icon and no sub label', added.type === 'MenuRow' && added.props.subLabel === undefined && added.props.key === undefined, added)
		added.props.onPress()
		added.props.onPress()
		await sleep(5)
		check('tapping the row closes the menu and opens the sheet once', s.sheets().filter(a => a.name === 'openLazy').length === 1 && s.sheets().some(a => a.name === 'hideAllActionSheets'), s.sheets().map(a => a.name))
		check('a box that has the row already is left alone', labels(s.jsx.jsx('Group', { children: [...[copy.props.children].flat()] })).length === 5)
		await s.running.stop()
		check('after stopping the rows are no longer changed', labels(s.jsx.jsx('Group', { children: [row('Copy Text', 'CopyIcon'), row('Reply', 'ReplyIcon')] })).length === 2)
	}
	{
		// The copy rows are found by their icon in other languages.
		const s = await setup()
		const row = (label, icon) => ({ type: 'MenuRow', props: { label, onPress() {}, icon: { type: { name: icon } } } })
		s.jsx.jsx('MessageActionsSheet', { message: MESSAGE })
		const group = s.jsx.jsx('Group', { children: [row('Copier le texte', 'CopyIcon'), row('Mention', 'AtIcon')] })
		check('the copy rows are found by their icon in any language', [group.props.children].flat().length === 3)
		const plain = s.jsx.jsx('Group', { children: [row('Block', 'BlockIcon'), row('Mute', 'MuteIcon')] })
		check('a box without copy rows is left alone', [plain.props.children].flat().length === 2)
		const text = s.jsx.jsx('Text', { children: 'hello' })
		check('an element with plain text children is left alone', text.props.children === 'hello')
		await s.running.stop()
	}
	{
		// The message may be given as plain ids on the sheet.
		const s = await setup()
		const row = (label, icon) => ({ type: 'MenuRow', props: { label, onPress() {}, icon: { type: { name: icon } } } })
		s.jsx.jsx('Sheet', { messageId: 'm9', channelId: 'c9' })
		const group = s.jsx.jsx('Group', { children: [row('Copy Text', 'CopyIcon'), row('Reply', 'ReplyIcon')] })
		;[group.props.children].flat().at(-1).props.onPress()
		await sleep(5)
		const call = s.sheets().filter(a => a.name === 'openLazy').at(-1)
		const Component = (await call.args[0]).default
		const view = s.runtime.mount(s.runtime.React.createElement(Component, {}))
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.TextInput').props.onChange('x')
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'React').props.onPress()
		await sleep(80)
		check('ids given as plain props are used', s.urls[0] === put('c9', 'm9', '🇽'), s.urls)
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



	// --- Another language: the box of copy rows is found by the icon inside the row's Icon element
	{
		const s = await setup()
		function CopyIcon() {}
		const row = (label, inner) => ({ type: 'MenuRow', props: { label, onPress() {}, icon: { type: { name: 'Icon' }, props: { IconComponent: inner } } } })
		s.jsx.jsx('MessageActionsSheet', { message: MESSAGE })
		const box = s.jsx.jsx('Group', { children: [row('Copier le texte', CopyIcon), row('Message', function ChatIcon() {})] })
		check('the row is added in another language', box.props.children.length === 3 && box.props.children.at(-1).props.label === 'Text React', box.props.children.map(r => r.props.label))
		await s.running.stop()
	}


	// --- Another language with nothing readable: the box after Reply and Forward is the copy box
	{
		const s = await setup()
		const row = label => ({ type: 'MenuRow', props: { label, onPress() {}, icon: { type: { name: 'Icon' }, props: {} } } })
		s.jsx.jsx('MessageActionsSheet', { message: MESSAGE })
		const pair = s.jsx.jsx('Group', { children: [row('Répondre'), row('Transférer')] })
		const copy = s.jsx.jsx('Group', { children: [row('Copier le texte'), row('Message'), row('Mentionner'), row('Copier le lien')] })
		const danger = s.jsx.jsx('Group', { children: [row('Supprimer'), row('Signaler'), row('Autre')] })
		check('the box after Reply and Forward gets the row in any language', copy.props.children.length === 5 && copy.props.children.at(-1).props.label === 'Text React', copy.props.children.map(r => r.props.label))
		check('the box of Reply and Forward and later boxes do not', pair.props.children.length === 2 && danger.props.children.length === 3)
		const alone = s.jsx.jsx('Group', { children: [row('A'), row('B'), row('C')] })
		check('a box with three rows and no Reply and Forward box before it is left alone', alone.props.children.length === 3)
		await s.running.stop()
	}


	// --- Screens that are not the message menu never get the row
	{
		const s = await setup()
		const switchRow = label => ({ type: 'Design.TableSwitchRow', props: { label, value: true, onValueChange() {} } })
		const radioRow = label => ({ type: 'Design.TableRadioRow', props: { label, value: label } })
		const tapRow = label => ({ type: 'MenuRow', props: { label, onPress() {} } })
		s.jsx.jsx('Group', { children: [switchRow('Update automatically'), switchRow('Skip on metered')] })
		const radios = s.jsx.jsx('Group', { children: [radioRow('0.5'), radioRow('1'), radioRow('2'), radioRow('3')] })
		check('switches and radio buttons never get the row', radios.props.children.length === 4)
		const taps = s.jsx.jsx('Group', { children: [tapRow('Check for updates'), tapRow('Install'), tapRow('Restore')] })
		check('tappable rows after switches do not either', taps.props.children.length === 3)
		s.jsx.jsx('Group', { children: [tapRow('A'), tapRow('B')] })
		const unknown = s.jsx.jsx('Group', { children: [tapRow('C'), tapRow('D'), tapRow('E')] })
		check('with no message known the row is not added by position', unknown.props.children.length === 3)
		await s.running.stop()
	}

	// --- Opening animation
	{
		const s = await setup({ saved: { animate: false } })
		s.runtime.finders.loadModule({ AccessibilityPreferencesContext: { _value: { reducedMotion: { enabled: false }, other: 1 }, Provider: 'Motion.Provider' } })
		const { view } = await s.openSheet()
		const provider = findNode(view.tree, n => n.type === 'Motion.Provider')
		check('with the animation off the sheet is told reduced motion is on', !!provider && provider.props.value.reducedMotion.enabled === true && provider.props.value.other === 1, provider && provider.props)
		await s.running.stop()
	}
	{
		const s = await setup()
		s.runtime.finders.loadModule({ AccessibilityPreferencesContext: { _value: { reducedMotion: { enabled: false } }, Provider: 'Motion.Provider' } })
		const { view } = await s.openSheet()
		check('with the animation on the sheet is drawn as before', !findNode(view.tree, n => n.type === 'Motion.Provider') && !!findNode(view.tree, n => n.type === 'Design.ActionSheet'))
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { animate: false } })
		const { view } = await s.openSheet()
		check('without the Discord context the sheet still opens', !!findNode(view.tree, n => n.type === 'Design.ActionSheet'))
		await s.running.stop()
	}


	// --- Accents, your own mappings, turned off built-ins
	{
		const run = async (saved, text, wait = 400) => {
			const s = await setup({ saved: { delaySeconds: '0.5', ...saved } })
			const { view } = await s.openSheet()
			await s.type(view, text)
			s.button(view, 'React').props.onPress()
			await sleep(wait)
			await s.running.stop()
			return s.urls
		}
		const sameAs = (urls, list) => JSON.stringify(urls) === JSON.stringify(list.map(e => put('chan1', 'msg1', e)))
		check('an accented letter is its plain letter', sameAs(await run({}, 'É'), ['🇪']))
		check('À is A, in capitals too', sameAs(await run({}, 'À'), ['🇦']))
		check('letters typed as a letter and a separate accent mark work', sameAs(await run({}, 'à'), ['🇦']))
		const normalize = String.prototype.normalize
		delete String.prototype.normalize
		const without = await run({}, 'Àé', 900)
		String.prototype.normalize = normalize
		check('accents work on a phone without normalize', sameAs(without, ['🇦', '🇪']), without)
		check('so are other accents and look-alikes', sameAs(await run({}, 'ñß', 900), ['🇳', '🇸']))
		check('your own word gives all its emoji', sameAs(await run({ customWords: [{ word: 'fuck', emoji: '🍆🍑' }] }, 'Fuck', 900), ['🍆', '🍑']))
		const inside = await run({ customWords: [{ word: 'fuck', emoji: '🍆🍑' }] }, 'fucks', 400)
		check('a word of yours is only used as a whole word', !inside.includes(put('chan1', 'msg1', '🍆')), inside)
		check('your own mapping of one character beats the built-in one', sameAs(await run({ customWords: [{ word: 'a', emoji: '🍎' }] }, 'a'), ['🍎']))
		check('your mapping of an accented letter beats its plain letter', sameAs(await run({ customWords: [{ word: 'é', emoji: '☕' }] }, 'é'), ['☕']))
		check('a turned off built-in word is spelled out', sameAs(await run({ hiddenDefaults: ['ok'] }, 'ok', 900), ['🇴', '🇰']))
		check('a turned off built-in character is left out', (await run({ hiddenDefaults: ['k'] }, 'k')).length === 0)
		const two = await run({ overrides: { a: ['🍎', '🍐', '🍑'] } }, 'aaa', 1500)
		check('the emoji of a character are tried in the order of its list', sameAs(two, ['🍎', '🍐', '🍑']), two)
		const nxt = await run({ overrides: { a: ['🍎', '🍐'], d: ['🍎', '🍋'] } }, 'ad', 900)
		check('the next emoji is used when one is already used', sameAs(nxt, ['🍎', '🍋']), nxt)
		check('a list of a word is used for the word', sameAs(await run({ overrides: { ok: ['👌'] } }, 'ok'), ['👌']))
		check('a list replaces the built-in emoji', sameAs(await run({ overrides: { a: ['🍎'] }, warn: false }, 'aa', 900), ['🍎']))
		check('an emoji of yours is not used twice', sameAs(await run({ customWords: [{ word: 'x', emoji: '🍎' }, { word: 'y', emoji: '🍎🍐' }] }, 'xy', 900), ['🍎', '🍐']))
	}

	// --- Mappings in the settings
	{
		const s = await setup({ saved: {} })
		const mountSettings = () => s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		let view = mountSettings()
		await view.settle()
		const input = label => findNodes(view.tree, n => n.type === 'Design.TextInput').find(n => n.props.label === label)
		input('Character or word').props.onChange('Fuck')
		input('Emoji (one or several)').props.onChange('🍆 🍑')
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Add mapping').props.onPress()
		await view.settle()
		check('a mapping is added and saved', JSON.stringify(s.storage.cache.customWords) === JSON.stringify([{ word: 'fuck', emoji: '🍆🍑' }]), s.storage.cache)
		check('it is listed', !!findNode(view.tree, n => n.type === 'Design.TableRow' && String(n.props.label).startsWith('fuck')))
		input('Character or word').props.onChange('x')
		input('Emoji (one or several)').props.onChange('abc')
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Add mapping').props.onPress()
		await view.settle()
		check('text that is not emoji is refused', s.storage.cache.customWords.length === 1)
		findNode(view.tree, n => n.type === 'Design.TableRow' && String(n.props.label).startsWith('fuck')).props.onPress()
		check('tapping a mapping removes it', s.storage.cache.customWords.length === 0)
		const aRow = () => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'a')
		check('a built-in character shows its emoji in order', aRow().props.subLabel === '🇦 🅰', aRow().props)
		aRow().props.onPress()
		const sheetCall = s.runtime.log.actions.filter(x => x.label === 'actionSheet' && x.name === 'openLazy' && x.args[1] === 'marklong.text-react.edit').at(-1)
		check('tapping it opens the editor for it', !!sheetCall)
		const Editor = (await sheetCall.args[0]).default
		let editor = s.runtime.mount(s.runtime.React.createElement(Editor, {}))
		await editor.settle()
		const rowsOf = () => findNodes(editor.tree, n => n.type === 'Design.TableRow').map(n => n.props.label)
		check('the editor lists its emoji in order', JSON.stringify(rowsOf()) === JSON.stringify(['1.  🇦', '2.  🅰']), rowsOf())
		const btn = text => findNode(editor.tree, n => n.type === 'Design.Button' && n.props.text === text)
		const field = () => findNode(editor.tree, n => n.type === 'Design.TextInput')
		field().props.onChange('🍎')
		await editor.settle()
		btn('Add at the top').props.onPress()
		await editor.settle()
		check('adding at the top puts the emoji first', JSON.stringify(s.storage.cache.overrides.a) === JSON.stringify(['🍎', '🇦', '🅰']), s.storage.cache.overrides)
		field().props.onChange('🅰')
		await editor.settle()
		btn('Add at the top').props.onPress()
		await editor.settle()
		check('adding one that is there moves it', JSON.stringify(s.storage.cache.overrides.a) === JSON.stringify(['🅰', '🍎', '🇦']), s.storage.cache.overrides)
		findNodes(editor.tree, n => n.type === 'Design.TableRow').find(n => n.props.label.includes('🍎')).props.onPress()
		await editor.settle()
		check('tapping an emoji removes it', JSON.stringify(s.storage.cache.overrides.a) === JSON.stringify(['🅰', '🇦']), s.storage.cache.overrides)
		field().props.onChange('abc')
		await editor.settle()
		btn('Add at the end').props.onPress()
		await editor.settle()
		check('text that is not emoji is refused', s.storage.cache.overrides.a.length === 2)
		view = mountSettings()
		await view.settle()
		check('the settings list shows the edited order', aRow().props.subLabel.startsWith('🅰 🇦') && aRow().props.subLabel.includes('(edited)'), aRow().props)
		editor = s.runtime.mount(s.runtime.React.createElement(Editor, {}))
		await editor.settle()
		btn('Turn off').props.onPress()
		check('the editor can turn it off', JSON.stringify(s.storage.cache.hiddenDefaults) === JSON.stringify(['a']), s.storage.cache)
		await editor.settle()
		btn('Turn on').props.onPress()
		await editor.settle()
		btn('Back to the built-in list').props.onPress()
		check('and go back to the built-in list', s.storage.cache.hiddenDefaults.length === 0 && !('a' in s.storage.cache.overrides), s.storage.cache)

		const copied = []
		view = mountSettings()
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Copy all built-in lists').props.onPress()
		await view.settle()
		check('the built-in lists can be copied', JSON.stringify(view.tree).includes('Copied the built-in lists'))
		void copied
		const paste = findNode(view.tree, n => n.type === 'TextInput' && String(n.props.placeholder).startsWith('a:'))
		paste.props.onChangeText(['a: 🍎 🍐', 'SPACE: 🟦', 'fuck: 🍆 🍑', 'nonsense', 'z: abc'].join(String.fromCharCode(10)))
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Apply lists').props.onPress()
		await view.settle()
		const o = s.storage.cache.overrides
		check('a pasted list sets the order of each key', JSON.stringify(o.a) === JSON.stringify(['🍎', '🍐']) && JSON.stringify(o[' ']) === JSON.stringify(['🟦']) && JSON.stringify(o.fuck) === JSON.stringify(['🍆', '🍑']), o)
		check('and lines that are not lists are skipped', !('z' in o) && JSON.stringify(view.tree).includes('skipped 2 lines'))
		s.storage.cache.overrides = {}

		const shared = JSON.stringify({ format: 'text-react-settings', version: 1, menu: false, delaySeconds: '2', customWords: [{ word: 'Hi', emoji: '👋' }, { word: 'bad', emoji: 'nope' }], hiddenDefaults: ['ok'] })
		findNode(view.tree, n => n.type === 'TextInput' && String(n.props.placeholder).startsWith('{')).props.onChangeText(shared)
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Import settings').props.onPress()
		await view.settle()
		const c = s.storage.cache
		check('importing takes the valid parts', c.menu === false && c.delaySeconds === '2' && JSON.stringify(c.customWords) === JSON.stringify([{ word: 'hi', emoji: '👋' }]) && JSON.stringify(c.hiddenDefaults) === JSON.stringify(['ok']), c)
		check('and says what was skipped', JSON.stringify(view.tree).includes('skipped 1'))
		findNode(view.tree, n => n.type === 'TextInput' && String(n.props.placeholder).startsWith('{')).props.onChangeText('{"a":1}')
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Import settings').props.onPress()
		await view.settle()
		check('other JSON is refused', JSON.stringify(view.tree).includes('That is not a Text React settings file') && s.storage.cache.menu === false)
		await s.running.stop()
	}

	// --- The settings screen
	{
		const s = await setup({ saved: { warn: false } })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		const rows = view.tree && require('./lib/harness.cjs').findNodes(view.tree, n => n.type === 'Design.TableSwitchRow')
		check('there are three switches, showing what is saved', rows.length === 3 && rows[0].props.value === true && rows[1].props.value === true && rows[2].props.value === false, rows.map(r => r.props.value))
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
