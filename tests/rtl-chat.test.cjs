'use strict'

/**
 * Tests for RTL Chat. Run with: node tests/rtl-chat.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('RTL Chat')

const RLM = '‏'
const LRE = '‪'
const PDF = '‬'

/**
 * Builds a fake phone: a layout direction manager, the native chat, the registry of apps, and the image and text parts.
 * Each can be left out.
 */
async function setup({ saved = {}, i18n = true, chat = true, registry = true, parts = true, reload = true, extraModules = [] } = {}) {
	const calls = { forceRTL: [], rows: [], registered: [], reload: 0 }
	const runtime = createRuntime({ overrides: { discord: { native: reload ? { BundleUpdaterManager: { reload: () => calls.reload++ } } : {} } } }).install()
	const RN = runtime.valenced.react.ReactNative
	const phone = { isRTL: false }
	if (i18n) {
		RN.I18nManager = {
			get isRTL() {
				return phone.isRTL
			},
			forceRTL: value => calls.forceRTL.push(value),
			allowRTL() {},
			swapLeftAndRightInRTL() {},
		}
	} else {
		RN.I18nManager = undefined
	}
	const original = { chat: null, provider: null }
	if (chat) {
		original.chat = { updateRows: (id, json, ...rest) => (calls.rows.push({ id, json, rest }), 'drawn') }
		RN.NativeModules = { DCDChatManager: original.chat }
	} else {
		RN.NativeModules = {}
	}

	// A registry with one app whose root is a function component.
	const providers = new Map()
	const apps = new Map()
	if (registry) {
		const Root = props => ({ type: 'AppRoot', props })
		apps.set('discord', { componentProvider: () => Root, section: false })
		providers.set('discord', Root)
		original.provider = apps.get('discord').componentProvider
		RN.AppRegistry = {
			getAppKeys: () => [...apps.keys()],
			getRunnable: key => apps.get(key),
			registerComponent: (key, provider, section) => (calls.registered.push(key), apps.set(key, { componentProvider: provider, section })),
		}
	} else {
		RN.AppRegistry = undefined
	}
	const flipParts = { Image: { render: () => ({ props: { style: { width: 10 } } }) }, Text: { render: () => ({ props: { style: { color: 'red' } } }) }, TextInput: { render: () => ({ props: {} }) } }
	if (parts) Object.assign(RN, flipParts)

	for (const module of extraModules) runtime.finders.loadModule(module)
	const { definition } = loadPlugin('rtl-chat')
	const storage = runtime.makeStorage(saved)
	const running = await startPlugin(definition, runtime, { storage })
	await sleep(5)
	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	return { runtime, running, definition, storage, calls, phone, apps, providers, original, flipParts, toasts, RN }
}

const messageRow = content => ({ type: 1, message: { content } })

;(async () => {
	// --- The layout direction
	{
		const s = await setup()
		check('right to left is asked of the phone by default', JSON.stringify(s.calls.forceRTL) === '[true]', s.calls.forceRTL)
		check('it remembers that it asked', s.storage.cache.forced === true, s.storage.cache)
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { mode: 'off', forced: true } })
		check('turning it off gives the phone its direction back if this plugin changed it', JSON.stringify(s.calls.forceRTL) === '[false]' && s.storage.cache.forced === false, s.calls.forceRTL)
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { mode: 'off', forced: false } })
		check('...but leaves a phone alone that is right to left for its own reasons', s.calls.forceRTL.length === 0)
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { mode: 'text' } })
		check('the text-only style does not touch the layout direction', s.calls.forceRTL.length === 0)
		await s.running.stop()
	}
	{
		const s = await setup({ i18n: false })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		check('a phone that cannot change direction is told so in the settings', !!findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Problem' && /does not let apps/.test(n.props.subLabel)))
		await s.running.stop()
	}

	// --- Right-aligned text
	{
		const s = await setup()
		const [rows] = [[messageRow('hello'), messageRow('two\nlines'), { type: 2, message: { content: 'not a message row' } }]]
		const answer = s.original.chat.updateRows('chan', JSON.stringify(rows), 'extra')
		const sent = JSON.parse(s.calls.rows.at(-1).json)
		check('message text gets the marks', sent[0].message.content === `${RLM}${LRE}hello${PDF}`, sent[0])
		check('every new line gets them too', sent[1].message.content === `${RLM}${LRE}two${PDF}\n${RLM}${LRE}lines${PDF}`, sent[1])
		check('other rows are left alone', sent[2].message.content === 'not a message row')
		check('the other arguments and the answer are passed on', s.calls.rows.at(-1).id === 'chan' && s.calls.rows.at(-1).rest[0] === 'extra' && answer === 'drawn')
		await s.running.stop()
	}
	{
		const s = await setup()
		const blocks = [{ type: 'paragraph', content: [{ type: 'text', content: 'one' }, { type: 'link', content: 'x' }] }, { type: 'codeBlock', content: 'raw' }]
		s.original.chat.updateRows('chan', JSON.stringify([messageRow(blocks)]))
		const content = JSON.parse(s.calls.rows.at(-1).json)[0].message.content
		check('paragraphs of parsed text are marked', content[0].content[0].content === RLM + LRE && content[0].content[1].content === `one` && content[0].content.at(-1).content === PDF, content)
		check('other blocks are left alone', content[1].content === 'raw')
		const inline = [{ type: 'text', content: 'a' }, { type: 'emoji', name: 'x' }]
		s.original.chat.updateRows('chan', JSON.stringify([messageRow(inline)]))
		const wrapped = JSON.parse(s.calls.rows.at(-1).json)[0].message.content
		check('a line of pieces is wrapped as a paragraph', wrapped.length === 4 && wrapped[0].content === RLM + LRE && wrapped[3].content === PDF, wrapped)
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { mode: 'off' } })
		const json = JSON.stringify([messageRow('hello')])
		s.original.chat.updateRows('chan', json)
		check('in the off style the rows pass through untouched', s.calls.rows.at(-1).json === json)
		await s.running.stop()
	}
	{
		const s = await setup()
		s.original.chat.updateRows('chan', 'this is not json')
		check('rows that are not JSON still reach the chat', s.calls.rows.at(-1).json === 'this is not json')
		s.original.chat.updateRows('chan', JSON.stringify({ not: 'a list' }))
		check('so do rows that are not a list', s.calls.rows.at(-1).json === JSON.stringify({ not: 'a list' }))
		s.original.chat.updateRows('chan', JSON.stringify([messageRow(null), messageRow(undefined), { type: 1 }]))
		check('rows with nothing to line up are untouched', !s.calls.rows.at(-1).json.includes(RLM))
		await s.running.stop()
	}
	{
		const s = await setup()
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		s.original.chat.updateRows('chan', JSON.stringify([messageRow('a'), messageRow('b')]))
		await view.settle()
		check('the settings count the rows seen and changed', !!findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Message text' && /rows seen: 2 · lined up: 2/.test(n.props.subLabel)))
		await s.running.stop()
		const before = s.calls.rows.length
		s.original.chat.updateRows('chan', JSON.stringify([messageRow('after')]))
		check('after stopping the chat is left as it was', !s.calls.rows.at(-1).json.includes(RLM) && s.calls.rows.length === before + 1)
	}
	{
		const s = await setup({ chat: false })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		check('without the native chat the settings say so', !!findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Message text' && /chat module not found/.test(n.props.subLabel)))
		await s.running.stop()
	}

	// --- Mirror everything
	{
		const s = await setup({ saved: { mode: 'mirror' } })
		check('every registered app is registered again, wrapped', s.calls.registered.length === 1 && s.calls.registered[0] === 'discord', s.calls.registered)
		const Wrapped = s.apps.get('discord').componentProvider()
		const view = s.runtime.mount(s.runtime.React.createElement(Wrapped, { initial: 1 }))
		await view.settle()
		const flipped = findNode(view.tree, n => n.type === 'View')
		check('in the mirror style the app is flipped sideways', JSON.stringify(flipped.props.style.transform) === '[{"scaleX":-1}]', flipped.props.style)
		check('the original app is drawn inside, with its props', !!findNode(view.tree, n => n.type === 'AppRoot' && n.props.initial === 1))
		await s.running.stop()
		check('stopping puts the original app back', s.apps.get('discord').componentProvider === s.original.provider && s.calls.registered.length === 2, s.calls.registered)
	}
	{
		const s = await setup({ saved: { mode: 'text' } })
		const Wrapped = s.apps.get('discord').componentProvider()
		const view = s.runtime.mount(s.runtime.React.createElement(Wrapped, {}))
		await view.settle()
		check('in any other style the wrapper flips nothing', findNode(view.tree, n => n.type === 'View').props.style.transform.length === 0)
		await s.running.stop()
	}
	{
		// Without a registry the root is found another way.
		const root = { default: function renderApplication() { return 'rendered' } }
		const s = await setup({ saved: { mode: 'mirror' }, registry: false, extraModules: [root] })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		check('the settings say what the mirror is hooked into', !!findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Mirror hooked into' && /renderApplication/.test(n.props.subLabel)), findNodes(view.tree, n => n.props?.label === 'Mirror hooked into').map(n => n.props.subLabel))
		const out = root.default(function Root() { return 'x' })
		check('renderApplication is given a wrapped root', out === 'rendered')
		await s.running.stop()
	}

	// --- Readable letters in the mirror
	{
		const s = await setup({ saved: { mode: 'mirror' } })
		const image = s.flipParts.Image.render()
		check('a picture is turned back the right way round', JSON.stringify(image.props.style[1].transform) === '[{"scaleX":-1}]', image.props.style)
		const text = s.flipParts.Text.render()
		check('text is flipped back and right-aligned', JSON.stringify(text.props.style[1]) === '{"transform":[{"scaleX":-1}],"textAlign":"right"}', text.props.style)
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { mode: 'mirror', readable: false } })
		const text = s.flipParts.Text.render()
		check('with "readable" off letters stay mirrored', text.props.style === undefined || !Array.isArray(text.props.style), text.props.style)
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { mode: 'rtl' } })
		const text = s.flipParts.Text.render()
		check('outside the mirror style nothing is flipped back', !Array.isArray(text.props.style))
		await s.running.stop()
	}

	// --- The settings screen
	{
		const s = await setup()
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		const group = () => findNode(view.tree, n => n.type === 'Design.TableRadioGroup')
		check('the four styles are offered', findNodes(group(), n => n.type === 'Design.TableRadioRow').length === 4)
		check('the saved style is chosen', group().props.value === 'rtl')
		check('a restart is asked for while the phone is not yet right to left', !!findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Right to left is set, but not on yet'))
		findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Restart Discord now').props.onPress()
		check('the restart button restarts Discord', s.calls.reload === 1, s.calls.reload)

		s.calls.forceRTL.length = 0
		group().props.onChange('mirror')
		await sleep(80)
		await view.settle()
		check('choosing a style saves it', s.storage.cache.mode === 'mirror', s.storage.cache)
		check('choosing a style that is not right to left gives the direction back', JSON.stringify(s.calls.forceRTL) === '[false]', s.calls.forceRTL)
		check('the mirror style shows its own switch', !!findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === 'Readable text and pictures'))
		findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === 'Readable text and pictures').props.onValueChange(false)
		await sleep(80)
		check('the readable switch is saved', s.storage.cache.readable === false)
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { mode: 'align' } })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		check('the old style "align" is shown as right to left', findNode(view.tree, n => n.type === 'Design.TableRadioGroup').props.value === 'rtl')
		await s.running.stop()
	}
	{
		const s = await setup({ saved: { mode: 'text' }, reload: false })
		s.phone.isRTL = true
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		check('a restart is asked for while the phone is still right to left', !!findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Normal direction is set, but right to left is still on'))
		findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Restart Discord now').props.onPress()
		check('without a way to restart, the person is asked to', s.toasts().includes('Close Discord completely and open it again'), s.toasts())
		await s.running.stop()
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
