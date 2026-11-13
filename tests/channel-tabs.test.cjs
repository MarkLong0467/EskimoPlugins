'use strict'

/** Tests for Channel Tabs. Run with: node tests/channel-tabs.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Channel Tabs')

const SCREEN_PATH = 'modules/main_tabs_v2/native/channel/StandaloneChannelScreen.tsx'

const CHANNELS = {
	a: { id: 'a', name: 'general', guild_id: 'g1', isPrivate: () => false, isThread: () => false },
	b: { id: 'b', name: 'dev', guild_id: 'g1', isPrivate: () => false, isThread: () => false },
	c: { id: 'c', name: 'a thread', guild_id: 'g1', isPrivate: () => false, isThread: () => true },
	d: { id: 'd', name: '', guild_id: null, recipients: ['u1'], isPrivate: () => true, isThread: () => false },
}

;(async () => {
	let Screen
	const opened = []
	const fetched = []
	const s = await startPort('channel-tabs', {
		stores: {
			ChannelStore: { getChannel: id => CHANNELS[id] },
			UserStore: { getUser: id => (id === 'u1' ? { username: 'bob', globalName: 'Bob' } : undefined) },
		},
		overrides: {
			externals: { ReactNativeSafeAreaContext: { useSafeAreaInsets: () => ({ top: 30, bottom: 0, left: 0, right: 0 }) } },
			discord: {
				utils: {
					modules: {
						finders: {
							getModuleWithImportedPath: (path, callback) => {
								if (path === SCREEN_PATH) setTimeout(() => callback({ default: Screen }), 0)
								return () => {}
							},
						},
					},
				},
			},
		},
		before: runtime => {
			Screen = function StandaloneChannelScreen(props) {
				return runtime.React.createElement('Screen', { channelId: props.channelId, guildId: props.guildId, nav: props.isNavigationScreen, index: props.screenIndex })
			}
			runtime.finders.loadModule({ transitionToChannel: (id, options) => opened.push([id, options]) })
			runtime.finders.loadModule({ fetchMessages: options => fetched.push(options), loadSelectedChannelIfNecessary() {} })
		},
	})
	check('the plugin starts without errors', s.errors.length === 0, s.errors)
	check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
	await sleep(10)

	const { createElement } = s.runtime.React
	const jsx = (type, props) => s.runtime.valenced.react.ReactJSXRuntime.jsx(type, props)
	const host = { props: {} }
	const render = async props => {
		host.props = props
		if (!host.view) host.view = await s.mountRender(() => jsx(Screen, host.props))
		else await host.view.settle()
		return host.view
	}
	const screens = view => findNodes(view.tree, n => n.type === 'Screen')
	const press = (view, label, event = 'onPress') => {
		const node = findNode(view.tree, n => n.props?.accessibilityLabel === label)
		node.props[event]()
		return node
	}
	const has = (view, label) => !!findNode(view.tree, n => n.props?.accessibilityLabel === label)
	const tabs = () => s.api.jsonStorage.cache?.tabs ?? []
	const settle = async view => {
		await sleep(5)
		await view.settle()
	}

	let view = await render({ channelId: 'a', guildId: 'g1', isNavigationScreen: true })
	check('the channel screen is drawn inside the frame, once', screens(view).length === 1 && screens(view)[0].props.channelId === 'a', screens(view).length)
	check('it gets the same props', screens(view)[0].props.guildId === 'g1' && screens(view)[0].props.nav === true)
	check('there is a button to save the channel and none to close everything yet', has(view, 'Save this channel as a tab') && !has(view, 'Close all tabs'))

	press(view, 'Save this channel as a tab')
	await settle(view)
	check('saving adds the open channel as a tab, with its server', tabs().length === 1 && tabs()[0].id === 'a' && tabs()[0].guildId === 'g1' && tabs()[0].name === 'general', tabs())
	check('the tab is named like the channel', textOf(view.tree).includes('#general'), textOf(view.tree))
	press(view, 'Save this channel as a tab')
	check('saving the same channel twice does not add it twice', tabs().length === 1)

	// More tabs.
	for (const id of ['b', 'c', 'd']) {
		const other = await render({ channelId: id, guildId: CHANNELS[id].guild_id })
		press(other, 'Save this channel as a tab')
	}
	view = await render({ channelId: 'a', guildId: 'g1', isNavigationScreen: true })
	await settle(view)
	const text = textOf(view.tree)
	check('every kind of channel is named for what it is', text.includes('#dev') && text.includes('🧵 a thread') && text.includes('@Bob'), text)

	// Switching.
	press(view, 'Tab: #dev')
	check('tapping a tab opens its channel', opened.length === 1 && opened[0][0] === 'b', opened)
	press(view, 'Tab: #general')
	check('tapping the open tab does nothing', opened.length === 1, opened)

	// Closing.
	press(view, 'Close tab: #dev')
	await settle(view)
	check('the ✕ closes just that tab', tabs().map(t => t.id).join() === 'a,c,d' && !has(view, 'Tab: #dev'), tabs())

	// Split.
	press(view, 'Split the screen')
	await settle(view)
	check('the Split button puts the first other tab in the second half', screens(view).length === 2 && screens(view)[1].props.channelId === 'c', screens(view).map(n => n.props.channelId))
	check('the second half is not a navigation screen, so its back button does not leave the app', screens(view)[1].props.nav === false)
	check('the messages of the second half are loaded, since Discord loads only those of the selected channel', fetched.some(f => f.channelId === 'c' && f.guildId === 'g1'), fetched)
	check('the first half is still the open channel', screens(view)[0].props.channelId === 'a')
	view = await render({ channelId: 'a', guildId: 'g1', isNavigationScreen: true, screenIndex: 2 })
	await settle(view)
	check('the second half has the screen index Discord uses for a second chat, so the two message boxes do not share a keyboard', screens(view)[0].props.index === 2 && screens(view)[1].props.index === 'channel-secondary-view-chat', screens(view).map(n => n.props.index))
	const halves = findNodes(view.tree, n => n.type === 'View' && typeof n.props.onLayout === 'function')
	halves.forEach((half, i) => half.props.onLayout({ nativeEvent: { layout: { width: 400, height: 300 + i } } }))
	check('the size of each half is kept for the report', halves.length === 2)
	s.api.jsonStorage.set({ splitChat: false })
	await settle(view)
	check('with the test switch off the second half draws no chat, only its channel', screens(view).length === 1 && has(view, 'Open 🧵 a thread'))
	s.api.jsonStorage.set({ splitChat: true })
	await settle(view)
	check('and on again it does', screens(view).length === 2)
	press(view, 'Tab: 🧵 a thread', 'onLongPress')
	await settle(view)
	check('holding the tab that is in the second half ends the split', screens(view).length === 1)
	press(view, 'Tab: @Bob', 'onLongPress')
	await settle(view)
	check('holding another tab puts it in the second half', screens(view).length === 2 && screens(view)[1].props.channelId === 'd')
	press(view, 'Tab: @Bob')
	// Discord opens the channel; the screen is drawn again with it.
	view = await render({ channelId: 'd', guildId: null, isNavigationScreen: true })
	await settle(view)
	check('tapping the tab of the second half opens it, and the channel that was open takes its place there', opened.at(-1)[0] === 'd' && screens(view)[0].props.channelId === 'd' && screens(view)[1].props.channelId === 'a', [opened.at(-1), screens(view).map(n => n.props.channelId)])
	press(view, 'Split the screen')
	await settle(view)
	check('Unsplit ends it', screens(view).length === 1)
	view = await render({ channelId: 'a', guildId: 'g1', isNavigationScreen: true })
	press(view, 'Tab: #general', 'onLongPress')
	check('the open channel cannot go in the second half', s.api.jsonStorage.cache.split == null)

	// A split with the channel itself is no split.
	press(view, 'Split the screen')
	await settle(view)
	const target = s.api.jsonStorage.cache.split.id
	const onTarget = await render({ channelId: target, guildId: 'g1' })
	await settle(onTarget)
	check('a split with the open channel ends by itself', s.api.jsonStorage.cache.split == null, s.api.jsonStorage.cache.split)
	view = await render({ channelId: 'a', guildId: 'g1', isNavigationScreen: true })

	// Layout.
	press(view, 'Tab: 🧵 a thread', 'onLongPress')
	s.api.jsonStorage.set({ layout: 'side' })
	view = await render({ channelId: 'a', guildId: 'g1' })
	await settle(view)
	const content = findNodes(view.tree, n => n.type === 'View' && n.props.style?.flexDirection === 'row' && n.props.style?.flex === 1)
	check('side by side the halves are in a row', content.length >= 1, content.length)
	s.api.jsonStorage.set({ layout: 'stacked' })
	press(view, 'Split the screen')

	// Position.
	s.api.jsonStorage.set({ position: 'left' })
	view = await render({ channelId: 'a', guildId: 'g1' })
	check('on the left the frame is a row', !!findNode(view.tree, n => n.type === 'View' && n.props.style?.flexDirection === 'row'))
	s.api.jsonStorage.set({ position: 'top' })
	view = await render({ channelId: 'a', guildId: 'g1' })

	// Folding the bar away.
	const pull = (view, label, from, to) => {
		const node = findNode(view.tree, n => n.props?.accessibilityLabel === label)
		node.props.onTouchStart({ nativeEvent: { pageX: from, pageY: from } })
		node.props.onTouchEnd({ nativeEvent: { pageX: to, pageY: to } })
	}
	// The bar takes a moment to slide.
	const slid = async view => {
		await sleep(320)
		await view.settle()
	}
	check('the bar has a handle', has(view, 'Hide the tabs'))
	pull(view, 'Hide the tabs', 60, 40)
	await settle(view)
	check('the tabs are still drawn while the bar slides out', has(view, 'Close all tabs'))
	await slid(view)
	check('pushing the handle up folds the bar away, and the chat stays', s.api.jsonStorage.cache.collapsed === true && !has(view, 'Close all tabs') && has(view, 'Show the tabs') && screens(view).length === 1)
	pull(view, 'Show the tabs', 40, 41)
	await slid(view)
	check('a tap on the handle brings it back', s.api.jsonStorage.cache.collapsed === false && has(view, 'Close all tabs'))
	pull(view, 'Hide the tabs', 40, 60)
	check('pulling down on an open bar leaves it open', s.api.jsonStorage.cache.collapsed === false)
	pull(view, 'Hide the tabs', 60, 40)
	await slid(view)
	pull(view, 'Show the tabs', 40, 70)
	await slid(view)
	check('pulling the handle down opens the bar', s.api.jsonStorage.cache.collapsed === false && has(view, 'Close all tabs'))

	// Close all.
	press(view, 'Close all tabs')
	await settle(view)
	check('✕ all closes every tab and the split', tabs().length === 0 && s.api.jsonStorage.cache.split == null && !has(view, 'Close all tabs'))

	// Not a channel.
	view = await render({ guildId: 'g1' })
	check('a screen with no channel is drawn as it was, without the bar', screens(view).length === 1 && !has(view, 'Save this channel as a tab'))

	// The settings.
	const settings = await s.mountSettings()
	const settingsText = textOf(settings.tree)
	check('the settings show where the bar is and how a split looks', /On top/.test(settingsText) && /Side by side/.test(settingsText))
	check('the settings list what was found', /channel screens/.test(settingsText) && /What it found/.test(settingsText), settingsText.slice(-200))

	s.stop()
	view = await render({ channelId: 'a', guildId: 'g1' })
	check('after stopping the screen is no longer framed', !has(view, 'Save this channel as a tab'))
	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
