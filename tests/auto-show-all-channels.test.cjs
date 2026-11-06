'use strict'

/** Tests for Auto Show All Channels. Run with: node tests/auto-show-all-channels.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNode, findNodes, textOf } = require('./lib/ports.cjs')

const { check, done } = createReporter('Auto Show All Channels')

// The plugin waits seconds for Discord to load a server. The tests squeeze every wait to a few milliseconds.
const realSetTimeout = globalThis.setTimeout
/** A wait that is not squeezed, for the test's own pauses. */
const wait = ms => new Promise(resolve => realSetTimeout(resolve, ms))
globalThis.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, Math.min(ms ?? 0, 6), ...rest)

const SECRET_NAME = 'Mark’s secret club'

/** A fake Discord: servers, which of them hide channels, and Discord's own `setGuildOptIn`. */
function fake({ servers = {}, optIn = [], withAction = true, actionBreaks = false, actionIgnored = false } = {}) {
	const guilds = {}
	const hiding = new Set(optIn)
	const calls = []
	const add = (id, { community = true, name = `Server ${id}` } = {}) => {
		guilds[id] = { id, name, features: { has: feature => feature === 'COMMUNITY' && community } }
	}
	for (const [id, options] of Object.entries(servers)) add(id, options)
	const stores = {
		GuildStore: { getGuild: id => guilds[id], getGuilds: () => ({ ...guilds }) },
		UserGuildSettingsStore: { isOptInEnabled: id => hiding.has(id) },
	}
	const actions = {
		setGuildOptIn: (id, on, location) => {
			calls.push([id, on, location])
			if (actionBreaks) throw new Error('boom')
			if (!actionIgnored && !on) hiding.delete(id)
		},
	}
	const before = runtime => {
		if (withAction) runtime.valenced.modules.finders.loadModule(actions)
	}
	return { guilds, hiding, calls, add, stores, before }
}

const start = (f, options = {}) => startPort('auto-show-all-channels', { stores: f.stores, before: f.before, ...options })

/** What Discord sends when you join: the join, then the server. The server is stored after the event is dispatched. */
function join(s, f, id, options = {}) {
	if (options.join !== false) s.runtime.fire('GUILD_JOIN', { guildId: id, lurker: !!options.lurker })
	s.runtime.fire('GUILD_CREATE', { guild: { id } })
	if (options.store !== false) f.add(id, options)
}

const history = s => s.storage.cache.history ?? []

;(async () => {
	// --- Joining a server
	{
		const f = fake({ servers: { old: {} } })
		const s = await start(f)
		join(s, f, 'g1', { name: SECRET_NAME })
		f.hiding.add('g1')
		await wait(40)
		check('joining a community server turns on Show All Channels', f.calls.length === 1 && f.calls[0][0] === 'g1' && f.calls[0][1] === false, f.calls)
		check('with a location that says where it came from', f.calls[0][2] === 'auto_show_all_channels')
		check('and the server no longer hides channels', !f.hiding.has('g1'))
		const entry = history(s)[0]
		check('the history has it, as a join', entry && entry.id === 'g1' && entry.outcome === 'turned on' && entry.how === 'joined' && entry.name === SECRET_NAME, history(s))
		check('the server is remembered so it is only done once', s.storage.cache.handled.join() === 'g1', s.storage.cache.handled)
		check('a toast names the server', s.toasts().some(t => t === `Show All Channels is on in ${SECRET_NAME}`), s.toasts())
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)

		join(s, f, 'g1', { join: false, store: false })
		await wait(30)
		check('joining the same server again does nothing', f.calls.length === 1, f.calls)
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	// --- Joining some other way
	{
		const f = fake({ servers: { old: {} } })
		const s = await start(f)
		f.add('later')
		f.hiding.add('later')
		// The event comes before Discord stores the server, so remove it again to show the event's moment.
		delete f.guilds.later
		s.runtime.fire('GUILD_CREATE', { guild: { id: 'later' } })
		f.add('later')
		await wait(40)
		check('a server that arrives without a join event but that Discord did not know is a join too', f.calls.length === 1 && f.calls[0][0] === 'later', f.calls)
		s.stop()
	}
	{
		const f = fake({ servers: { known: {} }, optIn: ['known'] })
		const s = await start(f)
		s.runtime.fire('GUILD_CREATE', { guild: { id: 'known' } })
		await wait(30)
		check('a server Discord already had (it is sent again at every connection) is not a join', f.calls.length === 0, f.calls)
		s.stop()
	}

	// --- Servers that need nothing
	{
		const f = fake({ servers: { old: {} } })
		const s = await start(f)
		join(s, f, 'plain', { community: false, name: 'Plain' })
		await wait(40)
		check('a server that is not a community server is left alone', f.calls.length === 0)
		check('and the history says why', history(s)[0].outcome === 'not a community server', history(s))
		join(s, f, 'shown')
		await wait(40)
		check('a server that already shows every channel needs nothing', f.calls.length === 0 && history(s)[0].outcome === 'already on', history(s)[0])
		s.stop()
	}

	// --- Previewing a server is not joining it
	{
		const f = fake({ servers: { old: {} } })
		const s = await start(f)
		s.runtime.fire('GUILD_JOIN', { guildId: 'peek', lurker: true })
		s.runtime.fire('GUILD_CREATE', { guild: { id: 'peek' } })
		f.add('peek')
		f.hiding.add('peek')
		await wait(40)
		check('a server you only preview (lurk in) is not changed', f.calls.length === 0 && history(s).length === 0, f.calls)
		join(s, f, 'peek', { store: false })
		await wait(40)
		check('when you then really join it, it is', f.calls.length === 1 && f.calls[0][0] === 'peek', f.calls)
		s.stop()
	}

	// --- Starting Discord
	{
		const f = fake()
		const s = await start(f)
		s.runtime.fire('GUILD_CREATE', { guild: { id: 'a' } })
		f.add('a')
		f.hiding.add('a')
		await wait(30)
		check('while Discord is still loading, servers that arrive are not joins', f.calls.length === 0)
		s.runtime.fire('CONNECTION_OPEN', {})
		await wait(30)
		f.add('b')
		f.hiding.add('b')
		delete f.guilds.b
		s.runtime.fire('GUILD_CREATE', { guild: { id: 'b' } })
		f.add('b')
		await wait(40)
		check('once Discord has settled a new server is a join', f.calls.length === 1 && f.calls[0][0] === 'b', f.calls)
		s.runtime.fire('CONNECTION_OPEN', {})
		s.runtime.fire('GUILD_CREATE', { guild: { id: 'c' } })
		f.add('c')
		f.hiding.add('c')
		await wait(2)
		check('and right after it connects again servers are not joins again', f.calls.length === 1, f.calls)
		s.stop()
	}

	// --- Servers that load late
	{
		const f = fake({ servers: { old: {} } })
		const s = await start(f)
		s.runtime.fire('GUILD_JOIN', { guildId: 'slow', lurker: false })
		s.runtime.fire('GUILD_CREATE', { guild: { id: 'slow' } })
		await wait(15)
		check('while Discord has not stored the server nothing is changed', f.calls.length === 0 && history(s).length === 0)
		f.add('slow')
		f.hiding.add('slow')
		await wait(40)
		check('and when it has, the option is turned on', f.calls.length === 1 && f.calls[0][0] === 'slow', f.calls)
		s.stop()
	}

	// --- Settings
	{
		const f = fake({ servers: { old: {} } })
		const s = await start(f, { saved: { enabled: false } })
		join(s, f, 'g1')
		f.hiding.add('g1')
		await wait(40)
		check('with automatic turned off a joined server is left alone', f.calls.length === 0)
		s.stop()
	}
	{
		const f = fake({ servers: { old: {} } })
		const s = await start(f, { saved: { handled: ['g1'] } })
		join(s, f, 'g1')
		f.hiding.add('g1')
		await wait(40)
		check('a server that was dealt with before is not touched again (so turning it off there stays)', f.calls.length === 0)
		s.stop()
	}

	// --- When it goes wrong
	{
		const f = fake({ servers: { old: {} }, actionIgnored: true })
		const s = await start(f)
		join(s, f, 'g1')
		f.hiding.add('g1')
		await wait(60)
		check('if Discord does not take the setting the history says it failed', history(s)[0].outcome === 'failed', history(s))
		const view = await s.mountSettings()
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		check('and the self-check says a server failed', textOf(view.tree).includes('No server failed'))
		view.unmount()
		s.stop()
	}
	{
		const f = fake({ servers: { old: {} }, actionBreaks: true })
		const s = await start(f)
		join(s, f, 'g1')
		f.hiding.add('g1')
		await wait(40)
		check('if Discord’s function throws it is reported, not thrown', history(s)[0].outcome === 'failed' && s.errors.length === 0, history(s))
		s.stop()
	}
	{
		const f = fake({ servers: { old: {} }, withAction: false })
		const s = await start(f)
		join(s, f, 'g1')
		f.hiding.add('g1')
		await wait(40)
		check('without Discord’s function nothing breaks and the server is reported as failed', history(s)[0].outcome === 'failed' && f.calls.length === 0)
		s.stop()
	}

	// --- The settings screen and "all my servers"
	{
		const f = fake({ servers: { a: { name: 'Alpha' }, b: { name: 'Beta' }, c: { community: false, name: 'Gamma' }, d: { name: 'Delta' } }, optIn: ['a', 'b', 'c'] })
		const s = await start(f)
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		check('the screen explains what it does', text.includes('Show All Channels turns that off'))
		check('it counts the servers', text.includes('4 in all, 3 community'), text.slice(0, 600))
		check('and the ones that still hide channels (not the non-community one)', text.includes('2 community server(s)'), text)
		const all = button(view, 'Show all channels in 2 server(s)')
		check('there is a button for all of them', !!all && all.props.disabled === false)
		check('the switch for joins is on by default', findNode(view.tree, n => n.type === 'Design.TableSwitchRow').props.value === true)
		check('it has the debugging section and no credits', text.includes('DEBUGGING') && !!button(view, 'Copy logs') && !hasCredits(text), text.slice(-300))

		const alerts = []
		const reactNative = s.runtime.valenced.react.ReactNative
		const originalAlert = reactNative.Alert
		reactNative.Alert = { alert: (title, message, buttons) => alerts.push({ title, message, buttons }) }
		all.props.onPress()
		reactNative.Alert = originalAlert
		check('the button asks first', alerts.length === 1 && alerts[0].title === 'Turn on Show All Channels?' && alerts[0].message.includes('2 community server(s)'), alerts)
		check('and nothing changed yet', f.calls.length === 0)
		alerts[0].buttons.find(b => b.text === 'Turn on').onPress()
		await wait(60)
		check('confirming turns it on in every server that hid channels', f.calls.map(c => c[0]).sort().join() === 'a,b' && f.calls.every(c => c[1] === false && c[2] === 'auto_show_all_channels'), f.calls)
		check('and leaves the others alone', !f.calls.some(c => c[0] === 'c' || c[0] === 'd'))
		check('with a toast', s.toasts().some(t => t === 'Show All Channels turned on in 2 server(s)'), s.toasts())
		check('the history has them as part of all servers', history(s).filter(h => h.how === 'all servers' && h.outcome === 'turned on').length === 2, history(s))
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		view.unmount()

		const after = await s.mountSettings()
		const text2 = textOf(after.tree)
		check('afterwards none are left', text2.includes('Every community server already shows all of its channels'), text2.slice(0, 700))
		check('the button says there is nothing to change and is off', button(after, 'Nothing to change').props.disabled === true)
		check('the list shows what was done', text2.includes('Alpha') && text2.includes('Beta') && text2.includes('turned on · all servers'), text2)

		button(after, 'Copy logs').props.onPress()
		await wait(5)
		const report = s.copied.at(-1) || ''
		check('Copy logs names the plugin and credits the author', report.includes('marklong.auto-show-all-channels 1.0.0') && report.includes('Made by MarkLong0467'))
		check('the report does not credit kmmiio99o or PalmDevs', !report.includes('kmmiio99o') && !report.includes('PalmDevs'))
		check('the report has the counts', /Turned on: 2, already on: 0, not community: 0, failed: 0/.test(report) && /Servers loaded: 4, community servers: 3/.test(report), report.split('\n').slice(6, 20))
		check('the report holds no server names', !report.includes('Alpha') && !report.includes('Beta') && !report.includes(SECRET_NAME))
		after.unmount()
		s.stop()
	}
	{
		const f = fake({ servers: { a: {} }, withAction: true })
		const s = await start(f)
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		check('with nothing to change the button is off and the history says so', button(view, 'Nothing to change').props.disabled === true && text.includes('Nothing yet'))
		const toggle = findNode(view.tree, n => n.type === 'Design.TableSwitchRow')
		toggle.props.onValueChange(false)
		check('the switch saves', s.storage.cache.enabled === false)
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const checks = textOf(view.tree)
		check('the self-check finds Discord’s function and the servers', checks.includes('Discord’s setGuildOptIn was found') && checks.includes('Your servers are loaded') && checks.includes('The plugin is watching for joins'), checks.slice(-500))
		view.unmount()
		s.stop()
	}

	// --- Stopping
	{
		const f = fake({ servers: { old: {} } })
		const s = await start(f)
		s.stop()
		join(s, f, 'g1')
		f.hiding.add('g1')
		await wait(40)
		check('after stopping joins are ignored', f.calls.length === 0)
	}

	globalThis.setTimeout = realSetTimeout
	done()
})()
